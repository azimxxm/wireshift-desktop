use std::collections::HashMap;
use tokio::process::Command;
use crate::device::model::{resolve_marketing_name, BatteryInfo, ConnectedDevice, ConnectionSpeed, IcloudStatus, StorageInfo};

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

        // Check if device is locked / not trusted yet
        let is_trusted = !info.is_empty() && !info_text.contains("PasswordProtected") && !info_text.contains("Could not connect");

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
        let connection = ConnectionSpeed {
            bus_type: if is_usb3_capable { "USB 3.2 Gen 2 (10 Gbps)".into() } else { "USB 2.0 (480 Mbps)".into() },
            max_bandwidth_mbps: if is_usb3_capable { 10000 } else { 480 },
            is_cable_throttled: false,
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
        let full_charge_capacity: u32 = map.get("FullChargeCapacity").and_then(|v| v.parse().ok()).unwrap_or(design_capacity);
        let is_charging: bool = map.get("BatteryIsCharging").map(|v| v == "true").unwrap_or(false);

        let health_percent = if design_capacity > 0 {
            let pct = (full_charge_capacity as f64 / design_capacity as f64) * 100.0;
            pct.clamp(0.0, 100.0).round() as u32
        } else {
            100
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

        Some(StorageInfo {
            total_bytes,
            available_bytes,
            used_bytes,
        })
    }

    /// Scan all currently connected devices
    pub async fn scan_all_devices() -> Vec<ConnectedDevice> {
        let udids = match Self::list_udids().await {
            Ok(u) => u,
            Err(_) => return Vec::new(),
        };

        let mut devices = Vec::new();
        for udid in udids {
            if let Ok(dev) = Self::inspect_device(&udid).await {
                devices.push(dev);
            }
        }
        devices
    }
}
