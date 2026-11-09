pub mod device;

use device::{Bridge, ConnectedDevice, DeviceDetector, FileExporter};

#[tauri::command]
async fn get_connected_devices() -> Result<Vec<ConnectedDevice>, String> {
    Ok(DeviceDetector::scan_all_devices().await)
}

#[tauri::command]
async fn refresh_device(udid: String) -> Result<ConnectedDevice, String> {
    DeviceDetector::invalidate_cache();
    DeviceDetector::inspect_device(&udid).await
}

#[tauri::command]
async fn get_default_export_dir() -> Result<String, String> {
    Ok(FileExporter::default_export_dir())
}

#[tauri::command]
async fn fetch_media_catalog(udid: String) -> Result<serde_json::Value, String> {
    let catalog = FileExporter::fetch_media_catalog(&udid).await?;
    Ok(serde_json::to_value(catalog).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn export_selected_media(
    udid: String,
    destination_dir: String,
    paths: Vec<String>,
) -> Result<usize, String> {
    FileExporter::export_selected_items(&udid, &destination_dir, paths).await
}

#[tauri::command]
async fn get_media_thumbnail(udid: String, album: String, filename: String) -> Result<String, String> {
    FileExporter::fetch_media_thumbnail(&udid, &album, &filename).await
}

#[tauri::command]
async fn fetch_media_thumbnails_batch(
    udid: String,
    items: Vec<(String, String)>,
) -> Result<std::collections::HashMap<String, String>, String> {
    Ok(FileExporter::fetch_media_thumbnails_batch(&udid, items).await)
}

#[tauri::command]
async fn get_export_stats(udid: String) -> Result<serde_json::Value, String> {
    let dcim_count = FileExporter::count_dcim_files(&udid).await.unwrap_or(0);
    let default_dir = FileExporter::default_export_dir();
    Ok(serde_json::json!({
        "dcim_count": dcim_count,
        "default_dir": default_dir,
    }))
}

#[tauri::command]
async fn get_export_progress(destination_dir: String) -> Result<serde_json::Value, String> {
    let progress = FileExporter::get_export_progress(&destination_dir);
    Ok(serde_json::to_value(progress).unwrap_or_default())
}

#[tauri::command]
async fn cancel_export() -> Result<(), String> {
    FileExporter::cancel_export();
    Ok(())
}

#[tauri::command]
async fn export_dcim_to_pc(udid: String, destination_dir: String) -> Result<usize, String> {
    FileExporter::export_dcim_to_folder(&udid, &destination_dir).await
}

#[tauri::command]
async fn diagnose_cable_speed(udid: String) -> Result<serde_json::Value, String> {
    let diag = DeviceDetector::diagnose_cable(&udid).await;
    Ok(serde_json::to_value(diag).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn run_cable_benchmark(udid: String) -> Result<serde_json::Value, String> {
    let res = FileExporter::run_cable_speed_test(&udid).await?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn open_folder_in_finder(path: String) -> Result<(), String> {
    let _ = tokio::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn check_system_status() -> Result<serde_json::Value, String> {
    let usbmuxd_running = std::path::Path::new("/var/run/usbmuxd").exists() || cfg!(target_os = "windows");
    let has_ideviceinfo = Bridge::is_available().await;

    Ok(serde_json::json!({
        "usbmuxd": usbmuxd_running,
        "libimobiledevice": has_ideviceinfo,
        "bundle": "uz.azimjondev.wireshift",
        "version": "1.0.1"
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Bridge::init_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                FileExporter::cancel_export();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_connected_devices,
            refresh_device,
            check_system_status,
            get_default_export_dir,
            get_export_stats,
            get_export_progress,
            fetch_media_catalog,
            export_selected_media,
            export_dcim_to_pc,
            open_folder_in_finder,
            diagnose_cable_speed,
            run_cable_benchmark,
            get_media_thumbnail,
            fetch_media_thumbnails_batch,
            cancel_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running WireShift desktop application");
}
