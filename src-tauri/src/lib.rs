pub mod device;
mod media_protocol;
mod wifi;

use device::{Bridge, ConnectedDevice, DeviceDetector, FileExporter, FileImporter};

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

/// Apps on the phone that accept files from the Mac (Mac -> iPhone target)
#[tauri::command]
async fn list_shared_apps(udid: String) -> Result<Vec<device::native::SharedApp>, String> {
    tokio::task::spawn_blocking(move || device::native::list_shared_apps(&udid))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn inspect_local_paths(paths: Vec<String>) -> Result<Vec<device::importer::LocalItem>, String> {
    tokio::task::spawn_blocking(move || FileImporter::inspect_local(&paths))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_to_iphone(
    udid: String,
    bundle_id: String,
    folder: String,
    paths: Vec<String>,
) -> Result<device::importer::ImportResult, String> {
    tokio::task::spawn_blocking(move || FileImporter::import(&udid, &bundle_id, &folder, &paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_import_progress() -> Result<device::importer::ImportProgress, String> {
    Ok(FileImporter::progress())
}

#[tauri::command]
async fn cancel_import() -> Result<(), String> {
    FileImporter::cancel();
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

/// Wi-Fi transfer: start the LAN server, files from the phone go to export_dir/folder_name
#[tauri::command]
async fn wifi_start(export_dir: String, folder_name: String) -> Result<wifi::WifiInfo, String> {
    let dir = if export_dir.trim().is_empty() { FileExporter::default_export_dir() } else { export_dir };
    wifi::start(FileExporter::resolve_path(&dir), &folder_name).await
}

#[tauri::command]
async fn wifi_stop() -> Result<(), String> {
    wifi::stop(None);
    Ok(())
}

#[tauri::command]
async fn wifi_info() -> Result<Option<wifi::WifiInfo>, String> {
    Ok(wifi::info())
}

#[tauri::command]
async fn wifi_status() -> Result<wifi::WifiStatus, String> {
    Ok(wifi::status())
}

#[tauri::command]
async fn wifi_add_outgoing(paths: Vec<String>) -> Result<Vec<wifi::OutgoingView>, String> {
    tokio::task::spawn_blocking(move || wifi::add_outgoing(&paths))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn wifi_remove_outgoing(id: u32) -> Result<(), String> {
    wifi::remove_outgoing(id);
    Ok(())
}

/// Photo/video preview for the Wi-Fi page lists ("in-<id>" or "out-<n>")
#[tauri::command]
async fn wifi_thumbnail(key: String) -> Result<String, String> {
    wifi::preview(&key).await
}

/// Click on a received file: open it, or show it in Finder
#[tauri::command]
async fn wifi_open_received(id: String, reveal: bool) -> Result<(), String> {
    wifi::open_received(&id, reveal).await
}

/// "Tozalash": clear finished rows from the Wi-Fi page (files on disk stay)
#[tauri::command]
async fn wifi_clear_history() -> Result<(), String> {
    wifi::clear_history();
    Ok(())
}

/// ✕ on an incoming row: stop that upload, the phone sees "Mac bekor qildi"
#[tauri::command]
async fn wifi_cancel_upload(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || wifi::cancel_upload(&id)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn wifi_clear_outgoing() -> Result<(), String> {
    wifi::clear_outgoing();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // logs go to stderr (Console.app / terminal); without this every tracing call is dropped
    let _ = tracing_subscriber::fmt().with_max_level(tracing::Level::INFO).with_target(false).try_init();
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
                FileImporter::cancel();
                wifi::stop(None);
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
            clear_thumbnail_cache,
            list_shared_apps,
            inspect_local_paths,
            import_to_iphone,
            get_import_progress,
            cancel_import,
            wifi_start,
            wifi_stop,
            wifi_info,
            wifi_status,
            wifi_add_outgoing,
            wifi_remove_outgoing,
            wifi_clear_outgoing,
            wifi_thumbnail,
            wifi_open_received,
            wifi_clear_history,
            wifi_cancel_upload
        ])
        .run(tauri::generate_context!())
        .expect("error while running WireShift desktop application");
}
