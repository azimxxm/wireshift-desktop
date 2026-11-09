use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    /// Current charge level 0-100 (what the status bar shows)
    pub charge_percent: u32,
    pub is_charging: bool,
    /// Fields below come from diagnostics_relay (AppleSmartBattery); None when unavailable
    pub cycle_count: Option<u32>,
    /// Maximum capacity vs. new, like Settings > Battery > Battery Health
    pub health_percent: Option<u32>,
    pub design_capacity_mah: Option<u32>,
    pub nominal_capacity_mah: Option<u32>,
    pub voltage_mv: Option<u32>,
    pub adapter_watts: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IcloudStatus {
    pub fmi_enabled: bool,
    pub activation_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionSpeed {
    pub bus_type: String,
    pub max_bandwidth_mbps: u32,
    pub is_cable_throttled: bool,
    pub negotiated_speed_mbps: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CableDiagnostic {
    /// Link speed macOS negotiated with the phone (ioreg UsbLinkSpeed)
    pub negotiated_speed_mbps: u32,
    /// Fastest link this iPhone model supports (480 or 10000)
    pub device_max_mbps: u32,
    pub is_cable_throttled: bool,
    /// Mac model identifier, e.g. "Mac14,6"
    pub mac_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CableBenchmarkResult {
    pub speed_mb_s: f64,
    pub transferred_mb: f64,
    pub elapsed_seconds: f64,
    pub sample_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    pub udid: String,
    pub name: String,
    pub marketing_name: String,
    pub product_type: String,
    pub ios_version: String,
    pub serial_number: String,
    pub color: String,
    pub is_trusted: bool,
    pub battery: Option<BatteryInfo>,
    pub storage: Option<StorageInfo>,
    pub icloud: Option<IcloudStatus>,
    pub connection: ConnectionSpeed,
    pub details: DeviceDetails,
}

/// Extra lockdown values shown on the diagnostics page (all read-only)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DeviceDetails {
    pub model_number: Option<String>,
    pub region_info: Option<String>,
    pub build_version: Option<String>,
    pub hardware_model: Option<String>,
    pub chip: Option<String>,
    pub baseband_version: Option<String>,
    pub imei: Option<String>,
    pub imei2: Option<String>,
    pub phone_number: Option<String>,
    pub sim_status: Option<String>,
    pub activation_state: Option<String>,
    /// lockdown "PasswordProtected": true while the screen is locked
    pub screen_locked: Option<bool>,
    pub wifi_address: Option<String>,
    pub bluetooth_address: Option<String>,
    pub time_zone: Option<String>,
}

/// Helper function to convert raw iOS ProductType (e.g. iPhone16,2) to marketing name
pub fn resolve_marketing_name(product_type: &str) -> String {
    match product_type {
        "iPhone10,1" | "iPhone10,4" => "iPhone 8".into(),
        "iPhone10,2" | "iPhone10,5" => "iPhone 8 Plus".into(),
        "iPhone10,3" | "iPhone10,6" => "iPhone X".into(),
        "iPhone11,2" => "iPhone XS".into(),
        "iPhone11,4" | "iPhone11,6" => "iPhone XS Max".into(),
        "iPhone11,8" => "iPhone XR".into(),
        "iPhone12,1" => "iPhone 11".into(),
        "iPhone12,3" => "iPhone 11 Pro".into(),
        "iPhone12,5" => "iPhone 11 Pro Max".into(),
        "iPhone12,8" => "iPhone SE (2nd gen)".into(),
        "iPhone13,1" => "iPhone 12 mini".into(),
        "iPhone13,2" => "iPhone 12".into(),
        "iPhone13,3" => "iPhone 12 Pro".into(),
        "iPhone13,4" => "iPhone 12 Pro Max".into(),
        "iPhone14,2" => "iPhone 13 Pro".into(),
        "iPhone14,3" => "iPhone 13 Pro Max".into(),
        "iPhone14,4" => "iPhone 13 mini".into(),
        "iPhone14,5" => "iPhone 13".into(),
        "iPhone14,6" => "iPhone SE (3rd gen)".into(),
        "iPhone14,7" => "iPhone 14".into(),
        "iPhone14,8" => "iPhone 14 Plus".into(),
        "iPhone15,2" => "iPhone 14 Pro".into(),
        "iPhone15,3" => "iPhone 14 Pro Max".into(),
        "iPhone15,4" => "iPhone 15".into(),
        "iPhone15,5" => "iPhone 15 Plus".into(),
        "iPhone16,1" => "iPhone 15 Pro".into(),
        "iPhone16,2" => "iPhone 15 Pro Max".into(),
        "iPhone17,1" => "iPhone 16 Pro".into(),
        "iPhone17,2" => "iPhone 16 Pro Max".into(),
        "iPhone17,3" => "iPhone 16".into(),
        "iPhone17,4" => "iPhone 16 Plus".into(),
        "iPhone17,5" => "iPhone 16e".into(),
        "iPhone18,1" => "iPhone 17 Pro".into(),
        "iPhone18,2" => "iPhone 17 Pro Max".into(),
        "iPhone18,3" => "iPhone 17".into(),
        "iPhone18,4" => "iPhone Air".into(),
        other => other.to_string(),
    }
}

/// Only Pro iPhones with USB-C have a USB 3 (10 Gbps) controller;
/// iPhone 15/16/17 non-Pro, 16e and Air are USB 2.0 (480 Mbps).
pub fn supports_usb3(product_type: &str) -> bool {
    matches!(
        product_type,
        "iPhone16,1" | "iPhone16,2" | "iPhone17,1" | "iPhone17,2" | "iPhone18,1" | "iPhone18,2"
    )
}

/// Human label for a negotiated USB link speed in Mbps
pub fn usb_label(mbps: u32) -> String {
    match mbps {
        m if m >= 10000 => "USB 3 · 10 Gbps".into(),
        m if m >= 5000 => "USB 3 · 5 Gbps".into(),
        m if m > 0 => format!("USB 2.0 · {} Mbps", m),
        _ => "Noma'lum".into(),
    }
}
