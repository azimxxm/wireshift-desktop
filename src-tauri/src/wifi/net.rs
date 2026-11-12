//! Which address the phone should open, and which peers may talk to us.

use std::net::{IpAddr, Ipv4Addr};

/// 10/8, 172.16/12, 192.168/16 and link-local 169.254/16
pub fn is_private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 10
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        || (o[0] == 192 && o[1] == 168)
        || (o[0] == 169 && o[1] == 254)
}

/// Only phones on the same local network may use the server
pub fn is_allowed_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_v4(v4),
        IpAddr::V6(v6) => v6.to_ipv4_mapped().is_some_and(is_private_v4),
    }
}

/// Lower is better. None = never use (VPN tunnels, AirDrop, internet sharing bridges).
fn interface_rank(name: &str) -> Option<u8> {
    const SKIP: [&str; 6] = ["utun", "bridge", "awdl", "llw", "vmnet", "anpi"];
    if SKIP.iter().any(|p| name.starts_with(p)) {
        return None;
    }
    Some(match name {
        "en0" => 0, // Wi-Fi on most Macs
        n if n.starts_with("en") => 1,
        _ => 2,
    })
}

/// This Mac's Wi-Fi / Ethernet IPv4, or None when it is not on a local network
pub fn lan_ipv4() -> Option<Ipv4Addr> {
    let ifaces = if_addrs::get_if_addrs().ok()?;
    ifaces
        .iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            IpAddr::V4(ip) if is_private_v4(ip) => {
                // link-local only when nothing better exists
                let link_local = u8::from(ip.octets()[0] == 169) * 10;
                interface_rank(&i.name).map(|r| (r + link_local, ip))
            }
            _ => None,
        })
        .min_by_key(|(rank, _)| *rank)
        .map(|(_, ip)| ip)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_ranges() {
        for ip in ["10.0.0.5", "172.16.0.1", "172.31.255.1", "192.168.1.20", "169.254.3.4"] {
            assert!(is_private_v4(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "172.32.0.1", "172.15.0.1", "127.0.0.1", "100.64.0.1", "192.169.0.1"] {
            assert!(!is_private_v4(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn mapped_v6_peers() {
        assert!(is_allowed_peer("::ffff:192.168.0.9".parse().unwrap()));
        assert!(!is_allowed_peer("::1".parse().unwrap()));
        assert!(!is_allowed_peer("2001:db8::1".parse().unwrap()));
    }

    #[test]
    fn tunnels_are_skipped() {
        assert_eq!(interface_rank("en0"), Some(0));
        assert_eq!(interface_rank("utun3"), None);
        assert_eq!(interface_rank("bridge100"), None);
    }
}
