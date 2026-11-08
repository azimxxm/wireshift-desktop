use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub cycle_count: u32,
    pub health_percent: u32,
    pub design_capacity: u32,
    pub current_capacity: u32,
    pub is_charging: bool,
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
        other => other.to_string(),
    }
}
