use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::process::Command;
use crate::device::Bridge;
use crate::device::model::{resolve_marketing_name, supports_usb3, usb_label, BatteryInfo, ConnectedDevice, ConnectionSpeed, DeviceDetails, IcloudStatus, StorageInfo};
use crate::device::native;

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
        let output = Bridge::tokio_cmd("idevice_id")
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
        let info_out = Bridge::tokio_cmd("ideviceinfo")
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
        let is_usb3_capable = supports_usb3(&product_type);
        let link_speed_mbps = Self::fetch_usb_link_speed(udid).await;
        let is_cable_throttled = is_usb3_capable && link_speed_mbps <= 480;

        let connection = ConnectionSpeed {
            bus_type: usb_label(link_speed_mbps),
            max_bandwidth_mbps: if is_usb3_capable { 10000 } else { 480 },
            is_cable_throttled,
            negotiated_speed_mbps: link_speed_mbps,
        };

        let details = Self::build_details(&info);

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
            details,
        })
    }

    /// Pick the extra read-only lockdown values used by the diagnostics page
    fn build_details(info: &HashMap<String, String>) -> DeviceDetails {
        let get = |k: &str| info.get(k).filter(|v| !v.is_empty()).cloned();
        DeviceDetails {
            model_number: get("ModelNumber"),
            region_info: get("RegionInfo"),
            build_version: get("BuildVersion"),
            hardware_model: get("HardwareModel"),
            chip: get("HardwarePlatform"),
            baseband_version: get("BasebandVersion"),
            imei: get("InternationalMobileEquipmentIdentity"),
            imei2: get("InternationalMobileEquipmentIdentity2"),
            phone_number: get("PhoneNumber"),
            sim_status: get("SIMStatus"),
            activation_state: get("ActivationState"),
            screen_locked: info.get("PasswordProtected").map(|v| v == "true"),
            wifi_address: get("WiFiAddress"),
            bluetooth_address: get("BluetoothAddress"),
            time_zone: get("TimeZone"),
        }
    }

    /// Read the negotiated UsbLinkSpeed of the connected iPhone from ioreg (Mbps)
    pub async fn fetch_usb_link_speed(_udid: &str) -> u32 {
        let output = match Command::new("ioreg").args(["-p", "IOUSB", "-w", "0", "-l"]).output().await {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return 0,
        };

        let mut in_iphone = false;
        for line in output.lines() {
            if line.contains("+-o ") {
                if in_iphone {
                    break;
                }
                in_iphone = line.contains("+-o iPhone@");
            }
            if in_iphone && line.contains("\"UsbLinkSpeed\"") {
                if let Some((_, val)) = line.split_once('=') {
                    if let Ok(bps) = val.trim().parse::<u64>() {
                        return (bps / 1_000_000) as u32;
                    }
                }
            }
        }
        0
    }

    /// Real Mac model identifier (e.g. "Mac14,6") instead of a hardcoded name
    async fn mac_model() -> String {
        Command::new("sysctl")
            .args(["-n", "hw.model"])
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Mac".into())
    }

    /// Cable check: negotiated link vs. what this iPhone model supports
    pub async fn diagnose_cable(udid: &str, product_type: &str) -> crate::device::model::CableDiagnostic {
        let negotiated = Self::fetch_usb_link_speed(udid).await;
        let device_max_mbps = if supports_usb3(product_type) { 10000 } else { 480 };
        crate::device::model::CableDiagnostic {
            negotiated_speed_mbps: negotiated,
            device_max_mbps,
            is_cable_throttled: device_max_mbps > 480 && negotiated > 0 && negotiated <= 480,
            mac_model: Self::mac_model().await,
        }
    }

    /// Battery: charge level from lockdown + real health data from diagnostics_relay
    async fn fetch_battery(udid: &str) -> Option<BatteryInfo> {
        let output = Bridge::tokio_cmd("ideviceinfo")
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
        // NOTE: BatteryCurrentCapacity is the charge level (%), not battery health
        let charge_percent: u32 = map.get("BatteryCurrentCapacity").and_then(|v| v.parse().ok()).unwrap_or(0);
        let is_charging = map.get("BatteryIsCharging").map(|v| v == "true").unwrap_or(false);

        let mut info = BatteryInfo {
            charge_percent,
            is_charging,
            cycle_count: None,
            health_percent: None,
            design_capacity_mah: None,
            nominal_capacity_mah: None,
            voltage_mv: None,
            adapter_watts: None,
        };

        let id = udid.to_string();
        let xml = tokio::task::spawn_blocking(move || native::ioregistry_xml(&id, Some("AppleSmartBattery"), None))
            .await
            .ok()
            .and_then(|r| r.map_err(|e| tracing::debug!("battery ioreg: {}", e)).ok());

        if let Some(xml) = xml {
            let int = |key: &str| -> Option<i64> {
                let re = regex::Regex::new(&format!(r"<key>{}</key>\s*<integer>(-?\d+)</integer>", key)).ok()?;
                re.captures(&xml)?.get(1)?.as_str().parse().ok()
            };
            let positive = |v: Option<i64>| v.filter(|n| *n > 0).map(|n| n as u32);

            info.cycle_count = int("CycleCount").map(|n| n.max(0) as u32);
            info.design_capacity_mah = positive(int("DesignCapacity"));
            info.nominal_capacity_mah = positive(int("NominalChargeCapacity")).or(positive(int("AppleRawMaxCapacity")));
            info.voltage_mv = positive(int("AppleRawBatteryVoltage")).or(positive(int("Voltage")));
            info.adapter_watts = positive(int("Watts"));
            if let (Some(nominal), Some(design)) = (info.nominal_capacity_mah, info.design_capacity_mah) {
                info.health_percent = Some(((nominal as f64 / design as f64) * 100.0).round().min(100.0) as u32);
            }
        }

        Some(info)
    }

    /// Storage: AFC devinfo (FSTotalBytes/FSFreeBytes). iOS 17+ no longer returns
    /// TotalDiskCapacity in com.apple.disk_usage, so lockdown is only a fallback.
    async fn fetch_storage(udid: &str) -> Option<StorageInfo> {
        let id = udid.to_string();
        if let Ok(Ok((total_bytes, available_bytes))) =
            tokio::task::spawn_blocking(move || native::filesystem_info(&id)).await
        {
            if total_bytes > 0 {
                return Some(StorageInfo {
                    total_bytes,
                    available_bytes,
                    used_bytes: total_bytes.saturating_sub(available_bytes),
                });
            }
        }

        let output = Bridge::tokio_cmd("ideviceinfo")
            .arg("-u")
            .arg(udid)
            .arg("-q")
            .arg("com.apple.disk_usage")
            .output()
            .await
            .ok()?;
        let map = Self::parse_key_value(&String::from_utf8_lossy(&output.stdout));
        let total_bytes: u64 = map.get("TotalDiskCapacity").and_then(|v| v.parse().ok())?;
        let available_bytes: u64 = map.get("TotalDataAvailable").and_then(|v| v.parse().ok()).unwrap_or(0);
        Some(StorageInfo {
            total_bytes,
            available_bytes,
            used_bytes: total_bytes.saturating_sub(available_bytes),
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
