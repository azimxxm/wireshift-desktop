//! Which network this Mac is on: Wi-Fi band, channel, link rate (or Ethernet).
//! macOS hides the Wi-Fi name (SSID) without Location permission, so the band
//! and channel are what tell the user whether both Macs sit on the 5 GHz side.

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct NetInfo {
    /// "wifi" | "ethernet" | "none"
    pub kind: String,
    /// None when macOS redacts it
    pub ssid: Option<String>,
    /// "5 GHz", "2.4 GHz", "6 GHz"
    pub band: Option<String>,
    pub channel: Option<String>,
    /// "Wi-Fi 6"
    pub standard: Option<String>,
    /// link rate in Mbit/s as macOS reports it
    pub rate_mbps: Option<u32>,
    pub signal_dbm: Option<i32>,
    pub ip: Option<String>,
}

fn run(cmd: &str, args: &[&str]) -> String {
    Command::new(cmd)
        .args(args)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// "interface: en1" from the default route
fn default_interface() -> Option<String> {
    run("/sbin/route", &["-n", "get", "default"])
        .lines()
        .find_map(|l| l.trim().strip_prefix("interface:").map(|v| v.trim().to_string()))
}

/// device -> "Wi-Fi" / "Ethernet" / "Thunderbolt Bridge"...
fn port_name(device: &str) -> Option<String> {
    let out = run("/usr/sbin/networksetup", &["-listallhardwareports"]);
    let mut name = None;
    for l in out.lines() {
        if let Some(n) = l.strip_prefix("Hardware Port: ") {
            name = Some(n.trim().to_string());
        } else if l.strip_prefix("Device: ").map(str::trim) == Some(device) {
            return name;
        }
    }
    None
}

fn standard_of(phy: &str) -> String {
    match phy.trim().trim_start_matches("802.11") {
        "be" => "Wi-Fi 7".into(),
        "ax" => "Wi-Fi 6".into(),
        "ac" => "Wi-Fi 5".into(),
        "n" => "Wi-Fi 4".into(),
        other => format!("802.11{other}"),
    }
}

/// The "Current Network Information" block of `system_profiler SPAirPortDataType`
fn parse_airport(text: &str, info: &mut NetInfo) {
    let mut in_current = false;
    let mut saw_name = false;
    for line in text.lines() {
        let t = line.trim();
        if t == "Current Network Information:" {
            in_current = true;
            saw_name = false;
            continue;
        }
        if !in_current {
            continue;
        }
        if t.starts_with("Other Local Wi-Fi Networks") || t.is_empty() && saw_name && info.band.is_some() {
            break;
        }
        if !saw_name && t.ends_with(':') && !t.contains(": ") {
            saw_name = true;
            let name = t.trim_end_matches(':');
            if name != "<redacted>" && !name.is_empty() {
                info.ssid = Some(name.to_string());
            }
            continue;
        }
        let Some((k, v)) = t.split_once(": ") else { continue };
        match k {
            "PHY Mode" => info.standard = Some(standard_of(v)),
            "Channel" => {
                // "44 (5GHz, 80MHz)"
                let (num, rest) = v.split_once(' ').unwrap_or((v, ""));
                info.channel = Some(num.to_string());
                let band = rest.trim_start_matches('(').split(',').next().unwrap_or("").trim();
                if let Some(ghz) = band.strip_suffix("GHz") {
                    // macOS writes the 2.4 GHz band as "2GHz"
                    let ghz = if ghz == "2" { "2.4" } else { ghz };
                    info.band = Some(format!("{ghz} GHz"));
                }
            }
            "Transmit Rate" => info.rate_mbps = v.trim().parse().ok(),
            "Signal / Noise" => info.signal_dbm = v.split_whitespace().next().and_then(|n| n.parse().ok()),
            _ => {}
        }
    }
}

/// Takes ~3 s (system_profiler); call it off the async threads
pub fn read() -> NetInfo {
    let mut info = NetInfo { kind: "none".into(), ..Default::default() };
    let Some(iface) = default_interface() else { return info };
    info.ip = Some(run("/usr/sbin/ipconfig", &["getifaddr", &iface]).trim().to_string()).filter(|s| !s.is_empty());
    let port = port_name(&iface).unwrap_or_default();
    if port.contains("Wi-Fi") || port.contains("AirPort") {
        info.kind = "wifi".into();
        parse_airport(&run("/usr/sbin/system_profiler", &["SPAirPortDataType"]), &mut info);
    } else {
        info.kind = "ethernet".into();
    }
    info
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "
          Current Network Information:
            <redacted>:
              PHY Mode: 802.11ax
              Channel: 44 (5GHz, 80MHz)
              Country Code: UZ
              Signal / Noise: -48 dBm / -88 dBm
              Transmit Rate: 720
              MCS Index: 7
          Other Local Wi-Fi Networks:
            Uy_24:
              Channel: 6 (2GHz, 20MHz)
";

    #[test]
    fn reads_current_network_only() {
        let mut i = NetInfo::default();
        parse_airport(SAMPLE, &mut i);
        assert_eq!(i.ssid, None);
        assert_eq!(i.band.as_deref(), Some("5 GHz"));
        assert_eq!(i.channel.as_deref(), Some("44"));
        assert_eq!(i.standard.as_deref(), Some("Wi-Fi 6"));
        assert_eq!(i.rate_mbps, Some(720));
        assert_eq!(i.signal_dbm, Some(-48));
    }

    #[test]
    fn named_network_on_24() {
        let mut i = NetInfo::default();
        parse_airport("Current Network Information:\n  Uy:\n    Channel: 6 (2GHz, 20MHz)\n    PHY Mode: 802.11n\n", &mut i);
        assert_eq!(i.ssid.as_deref(), Some("Uy"));
        assert_eq!(i.band.as_deref(), Some("2.4 GHz"));
        assert_eq!(i.standard.as_deref(), Some("Wi-Fi 4"));
    }
}

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

static CACHE: Mutex<Option<(Instant, NetInfo)>> = Mutex::new(None);
static REFRESHING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
const FRESH_FOR: Duration = Duration::from_secs(10);

fn cache() -> MutexGuard<'static, Option<(Instant, NetInfo)>> {
    CACHE.lock().unwrap_or_else(|e| e.into_inner())
}

/// Last known network, without refreshing
pub fn peek() -> Option<NetInfo> {
    cache().as_ref().map(|(_, i)| i.clone())
}

/// Last known network; starts a background refresh when it is older than a few seconds
pub fn current() -> Option<NetInfo> {
    let (stale, info) = match &*cache() {
        Some((t, i)) => (t.elapsed() > FRESH_FOR, Some(i.clone())),
        None => (true, None),
    };
    if stale && !REFRESHING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        std::thread::spawn(|| {
            let fresh = read();
            *cache() = Some((Instant::now(), fresh.clone()));
            REFRESHING.store(false, std::sync::atomic::Ordering::SeqCst);
            super::discovery::set_net(&fresh);
        });
    }
    info
}
