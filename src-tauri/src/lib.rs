pub mod device;

use device::{ConnectedDevice, DeviceDetector};

#[tauri::command]
async fn get_connected_devices() -> Result<Vec<ConnectedDevice>, String> {
    Ok(DeviceDetector::scan_all_devices().await)
}

#[tauri::command]
async fn refresh_device(udid: String) -> Result<ConnectedDevice, String> {
    DeviceDetector::inspect_device(&udid).await
}

#[tauri::command]
async fn check_system_status() -> Result<serde_json::Value, String> {
    let usbmuxd_running = std::path::Path::new("/var/run/usbmuxd").exists() || cfg!(target_os = "windows");
    let has_ideviceinfo = tokio::process::Command::new("ideviceinfo")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "usbmuxd": usbmuxd_running,
        "libimobiledevice": has_ideviceinfo,
        "bundle": "uz.azimjondev.wireshift",
        "version": "1.0.0"
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_connected_devices,
            refresh_device,
            check_system_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running WireShift desktop application");
}
