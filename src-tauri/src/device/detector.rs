use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::process::Command;
use crate::device::model::{resolve_marketing_name, BatteryInfo, ConnectedDevice, ConnectionSpeed, IcloudStatus, StorageInfo};

struct CachedScan {
    udids: Vec<String>,
    devices: Vec<ConnectedDevice>,
    timestamp: Instant,
}

static SCAN_CACHE: Mutex<Option<CachedScan>> = Mutex::new(None);

pub struct DeviceDetector;

impl DeviceDetector {
    /// List all connected iOS device UDIDs via `idevice_id -l`
    pub async fn list_udids() -> Result<Vec<String>, String> {
        let output = Command::new("idevice_id")
            .arg("-l")
            .output()
            .await
            .map_err(|e| format!("Failed to run idevice_id: {}. Make sure libimobiledevice is installed.", e))?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let udids: Vec<String> = stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        Ok(udids)
    }

    /// Parse raw `ideviceinfo` key: value output into a HashMap
    fn parse_key_value(text: &str) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for line in text.lines() {
            if let Some((k, v)) = line.split_once(':') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
        map
    }

    /// Fetch full inspection & diagnostics for a specific device by UDID
    pub async fn inspect_device(udid: &str) -> Result<ConnectedDevice, String> {
        // 1. General device info
        let info_out = Command::new("ideviceinfo")
            .arg("-u")
            .arg(udid)
            .output()
            .await
            .map_err(|e| format!("Failed to run ideviceinfo: {}", e))?;

        let info_text = String::from_utf8_lossy(&info_out.stdout);
        let info = Self::parse_key_value(&info_text);

        // Check if device is trusted: TrustedHostAttached is true, or info is populated without lockdownd connection error
        let is_trusted = if let Some(val) = info.get("TrustedHostAttached") {
            val == "true"
        } else {
            !info.is_empty() && !info_text.contains("Could not connect") && !info_text.contains("Password protected")
        };

        let name = info.get("DeviceName").cloned().unwrap_or_else(|| "iPhone".into());
        let product_type = info.get("ProductType").cloned().unwrap_or_else(|| "Unknown".into());
        let marketing_name = resolve_marketing_name(&product_type);
        let ios_version = info.get("ProductVersion").cloned().unwrap_or_else(|| "".into());
        let serial_number = info.get("SerialNumber").cloned().unwrap_or_else(|| "".into());
        let color = info.get("DeviceColor").cloned().unwrap_or_else(|| "Graphite".into());

        // 2. Battery diagnostics
        let battery = Self::fetch_battery(udid).await;

        // 3. Storage diagnostics
        let storage = Self::fetch_storage(udid).await;

        // 4. iCloud & Activation status
        let activation_state = info.get("ActivationState").cloned().unwrap_or_else(|| "Unknown".into());
        let icloud = Some(IcloudStatus {
            fmi_enabled: false, // will refine with lockdown domain if accessible
            activation_state,
        });

        // 5. Connection bus speed analysis
        let is_usb3_capable = product_type.starts_with("iPhone16,") || product_type.starts_with("iPhone17,");
        let (link_speed_mbps, port_desc) = Self::fetch_usb_link_speed(udid).await;
        let is_cable_throttled = is_usb3_capable && link_speed_mbps <= 480;

        let connection = ConnectionSpeed {
            bus_type: if link_speed_mbps >= 5000 {
                format!("USB 3.2 Gen 2 ({} Gbps)", link_speed_mbps / 1000)
            } else {
                "USB 2.0 (480 Mbps)".into()
            },
            max_bandwidth_mbps: if is_usb3_capable { 10000 } else { 480 },
            is_cable_throttled,
            negotiated_speed_mbps: link_speed_mbps,
            port_location: port_desc,
        };

        Ok(ConnectedDevice {
            udid: udid.to_string(),
            name,
            marketing_name,
            product_type,
            ios_version,
            serial_number,
            color,
            is_trusted,
            battery,
            storage,
            icloud,
            connection,
        })
    }

    /// Parse ioreg to extract real negotiated UsbLinkSpeed and locationID for a device
    pub async fn fetch_usb_link_speed(_udid: &str) -> (u32, String) {
        let output = match Command::new("ioreg")
            .args(&["-p", "IOUSB", "-w", "0", "-l"])
            .output()
            .await
        {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return (480, "MacBook Thunderbolt 4 / USB-C".into()),
        };

        let mut current_is_target = false;
        let mut link_speed_mbps = 480;
        let mut port_desc = "MacBook Thunderbolt 4 / USB-C".to_string();

        for line in output.lines() {
            if line.contains("+-o iPhone@") {
                current_is_target = true;
            } else if line.contains("+-o ") && !line.contains("+-o iPhone@") {
                if current_is_target {
                    break;
                }
            }

            if current_is_target {
                if line.contains("UsbLinkSpeed") {
                    if let Some((_, val)) = line.split_once('=') {
                        if let Ok(raw_speed) = val.trim().parse::<u64>() {
                            link_speed_mbps = (raw_speed / 1_000_000) as u32;
                        }
                    }
                }
                if line.contains("locationID") {
                    if let Some((_, val)) = line.split_once('=') {
                        if let Ok(loc) = val.trim().parse::<u32>() {
                            let hex_loc = format!("{:08x}", loc);
                            if hex_loc.starts_with("02") {
                                port_desc = "O'ng tomon (Right Side) — Thunderbolt 4 / USB-C".into();
                            } else if hex_loc.starts_with("01") {
                                port_desc = "Chap tomon (Left Side) — Thunderbolt 4 / USB-C".into();
                            }
                        }
                    }
                }
            }
        }

        (link_speed_mbps, port_desc)
    }

    /// Full cable & port diagnostic for MacBook M1 Pro and connected iPhone
    pub async fn diagnose_cable(udid: &str) -> crate::device::model::CableDiagnostic {
        let (link_speed_mbps, port_desc) = Self::fetch_usb_link_speed(udid).await;
        let port_side = if port_desc.contains("O'ng tomon") {
            "O'ng tomon (Right Side)"
        } else {
            "Chap tomon (Left Side)"
        };

        let is_throttled = link_speed_mbps <= 480;

        crate::device::model::CableDiagnostic {
            negotiated_speed_mbps: link_speed_mbps,
            negotiated_speed_text: if link_speed_mbps >= 1000 {
                format!("{} Gbps", link_speed_mbps / 1000)
            } else {
                format!("{} Mbps", link_speed_mbps)
            },
            max_device_speed_mbps: 10000,
            max_port_speed_mbps: 40000,
            is_cable_throttled: is_throttled,
            port_side: port_side.into(),
            port_name: port_desc,
            mac_model: "MacBook Pro M1 Pro (Thunderbolt 4 / USB4)".into(),
            verdict_summary: if is_throttled {
                "⚠️ Kabel tezligi USB 2.0 (480 Mbps) ga cheklangan".into()
            } else {
                "⚡ A'lo darajada! 10 Gbps High-Speed Direct".into()
            },
            verdict_details: if is_throttled {
                "Sizning MacBook M1 Pro (o'ng tomon porti) va iPhone 16 Pro Max 10 Gbps (1,250 MB/s) tezlikni to'liq quvvatlaydi. Lekin hozir ulangan kabel faqat 480 Mbps (USB 2.0) tezlik beryapti (iPhone qutisidagi oq kabel faqat quvvatlash uchun). Agar Thunderbolt 4 yoki USB 3.2 kabel ulasangiz, fayl ko'chirish 10 barobarga tezlashadi!".into()
            } else {
                "Kabelingiz USB 3.2 Gen 2 / Thunderbolt yuqori tezligida ulandi. 4K/ProRes videolarni eng maksimal tezlikda eksport qila olasiz.".into()
            },
        }
    }

    /// Query battery domain: com.apple.mobile.battery
    async fn fetch_battery(udid: &str) -> Option<BatteryInfo> {
        let output = Command::new("ideviceinfo")
            .arg("-u")
            .arg(udid)
            .arg("-q")
            .arg("com.apple.mobile.battery")
            .output()
            .await
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let map = Self::parse_key_value(&String::from_utf8_lossy(&output.stdout));
        let cycle_count: u32 = map.get("CycleCount").and_then(|v| v.parse().ok()).unwrap_or(0);
        let design_capacity: u32 = map.get("DesignCapacity").and_then(|v| v.parse().ok()).unwrap_or(100);
        let full_charge_capacity: u32 = map.get("FullChargeCapacity")
            .or_else(|| map.get("BatteryCurrentCapacity"))
            .and_then(|v| v.parse().ok())
            .unwrap_or(design_capacity);
        let is_charging: bool = map.get("BatteryIsCharging").map(|v| v == "true").unwrap_or(false);

        let health_percent = if design_capacity > 0 && design_capacity >= full_charge_capacity {
            let pct = (full_charge_capacity as f64 / design_capacity as f64) * 100.0;
            pct.clamp(0.0, 100.0).round() as u32
        } else {
            full_charge_capacity.clamp(0, 100)
        };

        Some(BatteryInfo {
            cycle_count,
            health_percent,
            design_capacity,
            current_capacity: full_charge_capacity,
            is_charging,
        })
    }

    /// Query disk storage domain: com.apple.disk_usage
    async fn fetch_storage(udid: &str) -> Option<StorageInfo> {
        let output = Command::new("ideviceinfo")
            .arg("-u")
            .arg(udid)
            .arg("-q")
            .arg("com.apple.disk_usage")
            .output()
            .await
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let map = Self::parse_key_value(&String::from_utf8_lossy(&output.stdout));
        let total_bytes: u64 = map.get("TotalDiskCapacity").and_then(|v| v.parse().ok()).unwrap_or(0);
        let available_bytes: u64 = map.get("TotalDataAvailable").and_then(|v| v.parse().ok()).unwrap_or(0);
        let used_bytes = total_bytes.saturating_sub(available_bytes);

        if total_bytes == 0 {
            return None;
        }

        Some(StorageInfo {
            total_bytes,
            available_bytes,
            used_bytes,
        })
    }

    /// Invalidate the device cache to force re-reading hardware info on next scan
    pub fn invalidate_cache() {
        if let Ok(mut lock) = SCAN_CACHE.lock() {
            *lock = None;
        }
    }

    /// Scan all currently connected devices with fast caching
    pub async fn scan_all_devices() -> Vec<ConnectedDevice> {
        let udids = match Self::list_udids().await {
            Ok(u) => u,
            Err(_) => return Vec::new(),
        };

        // If cache exists, has identical UDIDs, and is less than 20 seconds old, return cached devices
        if let Ok(lock) = SCAN_CACHE.lock() {
            if let Some(cached) = &*lock {
                if cached.udids == udids && cached.timestamp.elapsed() < Duration::from_secs(20) {
                    return cached.devices.clone();
                }
            }
        }

        let mut devices = Vec::new();
        for udid in &udids {
            if let Ok(dev) = Self::inspect_device(udid).await {
                devices.push(dev);
            }
        }

        // Update cache
        if let Ok(mut lock) = SCAN_CACHE.lock() {
            *lock = Some(CachedScan {
                udids: udids.clone(),
                devices: devices.clone(),
                timestamp: Instant::now(),
            });
        }

        devices
    }
}
