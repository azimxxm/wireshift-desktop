pub mod device;
mod media_protocol;

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
    keep_albums: bool,
) -> Result<usize, String> {
    FileExporter::export_selected_items(&udid, &destination_dir, paths, keep_albums).await
}

/// Which of these (path, size) pairs are not saved on the Mac yet
#[tauri::command]
async fn filter_new_files(
    destination_dir: String,
    items: Vec<(String, u64)>,
    keep_albums: bool,
) -> Result<Vec<String>, String> {
    Ok(FileExporter::filter_new_files(&destination_dir, items, keep_albums).await)
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
async fn diagnose_cable_speed(udid: String, product_type: String) -> Result<serde_json::Value, String> {
    let diag = DeviceDetector::diagnose_cable(&udid, &product_type).await;
    Ok(serde_json::to_value(diag).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn run_cable_benchmark(udid: String) -> Result<serde_json::Value, String> {
    let res = FileExporter::run_cable_speed_test(&udid).await?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn open_folder_in_finder(path: String) -> Result<(), String> {
    let resolved = FileExporter::resolve_path(&path);
    let _ = tokio::fs::create_dir_all(&resolved).await;
    let _ = tokio::process::Command::new("open")
        .arg(&resolved)
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
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// Double-click on our custom titlebar: follow System Settings >
/// Desktop & Dock > "Double-click a window's title bar to" (Zoom / Minimize / nothing).
#[tauri::command]
async fn titlebar_double_click(window: tauri::WebviewWindow) -> Result<(), String> {
    let action = tokio::process::Command::new("defaults")
        .args(["read", "-g", "AppleActionOnDoubleClick"])
        .output()
        .await
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    match action.as_str() {
        "Minimize" => window.minimize().map_err(|e| e.to_string()),
        "None" | "Do Nothing" => Ok(()),
        // "Maximize" (Zoom), "Fill" or unset -> zoom, same as a native titlebar
        _ => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize().map_err(|e| e.to_string())
            } else {
                window.maximize().map_err(|e| e.to_string())
            }
        }
    }
}

fn dir_size(path: &std::path::Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_size(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

/// Size of the local thumbnail cache on this Mac (never touches the phone)
#[tauri::command]
async fn get_cache_size() -> Result<u64, String> {
    let root = FileExporter::cache_root().join("thumbnails");
    Ok(tokio::task::spawn_blocking(move || dir_size(&root)).await.unwrap_or(0))
}

/// Delete only the local thumbnail cache on this Mac (regenerable, phone untouched)
#[tauri::command]
async fn clear_thumbnail_cache() -> Result<(), String> {
    let root = FileExporter::cache_root().join("thumbnails");
    if root.exists() {
        tokio::fs::remove_dir_all(&root).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Bridge::init_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("wsmedia", |_ctx, request, responder| {
            // AFC reads block, keep them off the main thread
            std::thread::spawn(move || responder.respond(media_protocol::handle(request)));
        })
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
            get_export_progress,
            fetch_media_catalog,
            filter_new_files,
            export_selected_media,
            open_folder_in_finder,
            diagnose_cable_speed,
            run_cable_benchmark,
            get_media_thumbnail,
            fetch_media_thumbnails_batch,
            cancel_export,
            titlebar_double_click,
            get_cache_size,
            clear_thumbnail_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running WireShift desktop application");
}
