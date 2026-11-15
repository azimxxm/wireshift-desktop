//! Bonjour: tell the network "WireShift is here" and list the other Macs that say the same.

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Mutex, MutexGuard};

const SERVICE: &str = "_wireshift._tcp.local.";

/// The other Mac's network, as it announced it
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct PeerNet {
    pub kind: String,
    pub band: Option<String>,
    pub channel: Option<String>,
    pub rate_mbps: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Peer {
    pub net: Option<PeerNet>,
    pub id: String,
    pub name: String,
    /// "MacBook Pro", "Mac mini"...
    pub model: String,
    #[serde(skip)]
    pub addrs: Vec<SocketAddr>,
    /// a direct cable link (Thunderbolt Bridge) is available
    pub cable: bool,
    #[serde(skip)]
    fullname: String,
}

static PEERS: Mutex<Vec<Peer>> = Mutex::new(Vec::new());
static DAEMON: Mutex<Option<ServiceDaemon>> = Mutex::new(None);

/// What we announce; kept so a network change can re-announce with new TXT values
#[derive(Clone)]
struct Announce {
    port: u16,
    id: String,
    name: String,
    model: String,
    net: PeerNet,
}
static ANNOUNCE: Mutex<Option<Announce>> = Mutex::new(None);

fn service_info(a: &Announce) -> Result<ServiceInfo, String> {
    let mut props: HashMap<String, String> = [
        ("id".to_string(), a.id.clone()),
        ("name".to_string(), a.name.clone()),
        ("model".to_string(), a.model.clone()),
        ("v".to_string(), super::proto::PROTO_VERSION.to_string()),
        ("kind".to_string(), a.net.kind.clone()),
    ]
    .into();
    if let Some(b) = &a.net.band {
        props.insert("band".into(), b.clone());
    }
    if let Some(c) = &a.net.channel {
        props.insert("ch".into(), c.clone());
    }
    if let Some(r) = a.net.rate_mbps {
        props.insert("rate".into(), r.to_string());
    }
    let host = format!("ws-{}.local.", &a.id[..12]);
    Ok(ServiceInfo::new(SERVICE, &a.id, &host, "", a.port, props).map_err(|e| e.to_string())?.enable_addr_auto())
}

fn peer_net(n: &super::netinfo::NetInfo) -> PeerNet {
    PeerNet { kind: n.kind.clone(), band: n.band.clone(), channel: n.channel.clone(), rate_mbps: n.rate_mbps }
}

/// Change what we announce and tell the other Macs (same instance name = an update)
fn reannounce(change: impl FnOnce(&mut Announce) -> bool) {
    let announce = {
        let mut a = lock(&ANNOUNCE);
        let Some(cur) = a.as_mut() else { return };
        if !change(cur) {
            return;
        }
        cur.clone()
    };
    if let (Some(d), Ok(info)) = (lock(&DAEMON).as_ref(), service_info(&announce)) {
        if let Err(e) = d.register(info) {
            tracing::warn!("maclink: re-announce failed: {e}");
        }
    }
}

/// Network changed (e.g. moved from 2.4 to 5 GHz)
pub fn set_net(n: &super::netinfo::NetInfo) {
    let net = peer_net(n);
    reannounce(|a| {
        let changed = a.net != net;
        a.net = net;
        changed
    });
}

/// The user renamed this Mac
pub fn set_name(name: &str) {
    reannounce(|a| {
        let changed = a.name != name;
        a.name = name.to_string();
        changed
    });
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn peers() -> Vec<Peer> {
    let mut list = lock(&PEERS).clone();
    list.sort_by_key(|p| p.name.to_lowercase());
    list
}

pub fn peer(id: &str) -> Option<Peer> {
    lock(&PEERS).iter().find(|p| p.id == id).cloned()
}

/// Cable first (Thunderbolt Bridge uses 169.254.x.x), then the normal network
fn order_addrs(ips: impl Iterator<Item = Ipv4Addr>, port: u16) -> Vec<SocketAddr> {
    let mut v: Vec<Ipv4Addr> = ips.filter(|ip| !ip.is_loopback() && !ip.is_unspecified()).collect();
    v.sort_by_key(|ip| (!ip.is_link_local(), *ip));
    v.dedup();
    v.into_iter().map(|ip| SocketAddr::new(IpAddr::V4(ip), port)).collect()
}

pub fn start(port: u16, my_id: &str, name: &str, model: &str) -> Result<(), String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("Bonjour ishga tushmadi: {e}"))?;
    let net = super::netinfo::current().map(|n| peer_net(&n)).unwrap_or_default();
    let announce = Announce { port, id: my_id.into(), name: name.into(), model: model.into(), net };
    daemon.register(service_info(&announce)?).map_err(|e| format!("Bonjour e'loni xato: {e}"))?;
    *lock(&ANNOUNCE) = Some(announce);
    let events = daemon.browse(SERVICE).map_err(|e| format!("Bonjour qidiruvi xato: {e}"))?;
    let me = my_id.to_string();
    std::thread::Builder::new()
        .name("maclink-browse".into())
        .spawn(move || {
            while let Ok(ev) = events.recv() {
                handle(ev, &me);
            }
        })
        .map_err(|e| e.to_string())?;
    *lock(&DAEMON) = Some(daemon);
    Ok(())
}

fn handle(ev: ServiceEvent, me: &str) {
    match ev {
        ServiceEvent::ServiceResolved(info) => {
            let Some(id) = info.get_property_val_str("id").map(str::to_string) else { return };
            if id == me {
                return;
            }
            let addrs = order_addrs(info.get_addresses_v4().into_iter().copied(), info.get_port());
            if addrs.is_empty() {
                return;
            }
            let txt = |k: &str| info.get_property_val_str(k).filter(|v| !v.is_empty()).map(str::to_string);
            let net = txt("kind").map(|kind| PeerNet {
                kind,
                band: txt("band"),
                channel: txt("ch"),
                rate_mbps: txt("rate").and_then(|r| r.parse().ok()),
            });
            let peer = Peer {
                net,
                name: info.get_property_val_str("name").unwrap_or("Mac").to_string(),
                model: info.get_property_val_str("model").unwrap_or("Mac").to_string(),
                cable: addrs[0].ip().to_string().starts_with("169.254."),
                addrs,
                fullname: info.get_fullname().to_string(),
                id,
            };
            let mut peers = lock(&PEERS);
            peers.retain(|p| p.id != peer.id);
            peers.push(peer);
        }
        ServiceEvent::ServiceRemoved(_, fullname) => lock(&PEERS).retain(|p| p.fullname != fullname),
        _ => {}
    }
}

#[cfg(test)]
pub fn insert_for_test(id: &str, addr: SocketAddr) {
    lock(&PEERS).push(Peer { net: None, id: id.into(), name: "Test Mac".into(), model: "Mac mini".into(), addrs: vec![addr], cable: false, fullname: id.into() });
}

pub fn stop() {
    if let Some(d) = lock(&DAEMON).take() {
        let _ = d.shutdown();
    }
    *lock(&ANNOUNCE) = None;
    lock(&PEERS).clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real Bonjour on this Mac's network: two "Macs" in one process find each other.
    /// Needs a network interface, so it only runs on request: cargo test -- --ignored
    #[test]
    #[ignore]
    fn two_services_find_each_other() {
        let a = super::super::proto::random_hex(16);
        let b = super::super::proto::random_hex(16);
        start(47901, &a, "Test A", "MacBook Pro").unwrap();
        start(47902, &b, "Test B", "Mac mini").unwrap();
        let t0 = std::time::Instant::now();
        while t0.elapsed() < std::time::Duration::from_secs(10) {
            if peer(&a).is_some() && peer(&b).is_some() {
                let pb = peer(&b).unwrap();
                assert_eq!(pb.model, "Mac mini");
                assert!(pb.addrs.iter().all(|x| x.port() == 47902));
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        panic!("not found: {:?}", peers().iter().map(|p| &p.name).collect::<Vec<_>>());
    }

    #[test]
    fn cable_address_first() {
        let ips = ["192.168.1.5", "169.254.10.2", "127.0.0.1"].iter().map(|s| s.parse().unwrap());
        let v = order_addrs(ips, 9);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].ip().to_string(), "169.254.10.2");
    }
}
