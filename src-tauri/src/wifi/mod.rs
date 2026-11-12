//! Wi-Fi transfer: a small LAN-only HTTP server. The phone scans a QR code,
//! opens a page in Safari and sends/receives files (no app on the phone).

mod names;
mod net;
mod outgoing;
mod qr;
mod range;
mod server;
mod state;
mod upload;
mod zip;

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use tokio_util::sync::CancellationToken;

pub use outgoing::OutgoingView;
use state::{IncomingView, PhoneView, Shared, ZipView};

/// No request (and no bytes moving) for this long -> the server turns itself off
const IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const IDLE_CHECK_EVERY: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize)]
pub struct WifiInfo {
    pub url: String,
    pub qr_svg: String,
    /// where the phone's files are saved
    pub folder: String,
}

#[derive(Debug, Serialize)]
pub struct WifiStatus {
    pub running: bool,
    pub lan_ip: Option<String>,
    pub url: Option<String>,
    pub folder: Option<String>,
    pub phone: Option<PhoneView>,
    pub incoming: Vec<IncomingView>,
    pub outgoing: Vec<OutgoingView>,
    pub zips: Vec<ZipView>,
    pub received_total: u64,
    pub sent_total: u64,
    pub stop_reason: Option<String>,
}

struct Running {
    shared: Arc<Shared>,
    cancel: CancellationToken,
    info: WifiInfo,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);
/// The last stopped session, so the page still shows what came in (and why it stopped)
static LAST: Mutex<Option<(Arc<Shared>, Option<String>)>> = Mutex::new(None);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn info() -> Option<WifiInfo> {
    lock(&SERVER).as_ref().map(|r| r.info.clone())
}

/// Thumbnail dirs left by a session that never stopped cleanly (app killed, crash)
fn clear_stale_temp() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else { return };
    for e in entries.flatten() {
        if e.file_name().to_string_lossy().starts_with("wireshift-wifi-") {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

/// Binds on the Mac's LAN IPv4 with a random port and a fresh 128-bit key
pub async fn start(export_dir: PathBuf, folder_name: &str) -> Result<WifiInfo, String> {
    if let Some(existing) = info() {
        return Ok(existing);
    }
    let ip = net::lan_ipv4()
        .ok_or("Mac hech qanday Wi-Fi yoki Ethernet tarmog'iga ulanmagan (lokal IPv4 manzil topilmadi)")?;
    let listener = tokio::net::TcpListener::bind(SocketAddr::new(IpAddr::V4(ip), 0))
        .await
        .map_err(|e| format!("Wi-Fi ulanishni ochib bo'lmadi ({ip}): {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    clear_stale_temp();
    let token = state::new_token()?;
    let dest = export_dir.join(names::sanitize_file_name(folder_name));
    let url = format!("http://{ip}:{port}/?k={token}");
    let info = WifiInfo { qr_svg: qr::svg(&url)?, url, folder: dest.to_string_lossy().into_owned() };
    let shared = Arc::new(Shared::new(token, dest));
    let cancel = CancellationToken::new();
    {
        let mut slot = lock(&SERVER);
        if let Some(r) = slot.as_ref() {
            return Ok(r.info.clone()); // a second click raced us
        }
        *slot = Some(Running { shared: shared.clone(), cancel: cancel.clone(), info: info.clone() });
    }
    *lock(&LAST) = None;
    tauri::async_runtime::spawn(server::run(listener, shared.clone(), cancel.clone()));
    tauri::async_runtime::spawn(watch_idle(shared, cancel));
    tracing::info!(%ip, port, "wifi server started");
    Ok(info)
}

pub fn stop(reason: Option<String>) {
    let Some(run) = lock(&SERVER).take() else { return };
    run.cancel.cancel();
    *lock(&LAST) = Some((run.shared, reason));
    let _ = std::fs::remove_dir_all(preview_dir()); // regenerable Quick Look previews
    tracing::info!("wifi server stopped");
}

async fn watch_idle(shared: Arc<Shared>, cancel: CancellationToken) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => return,
            _ = tokio::time::sleep(IDLE_CHECK_EVERY) => {}
        }
        if shared.idle_for() >= IDLE_TIMEOUT {
            stop(Some("15 daqiqa hech narsa yuborilmagani uchun ulanish o'chirildi".into()));
            return;
        }
    }
}

pub fn status() -> WifiStatus {
    let running = lock(&SERVER).as_ref().map(|r| (r.shared.clone(), r.info.clone()));
    let (shared, url, reason) = match running {
        Some((s, info)) => (Some(s), Some(info.url), None),
        None => match lock(&LAST).clone() {
            Some((s, reason)) => (Some(s), None, reason),
            None => (None, None, None),
        },
    };
    let (received_total, sent_total) = shared.as_ref().map_or((0, 0), |s| s.totals());
    WifiStatus {
        running: url.is_some(),
        lan_ip: net::lan_ipv4().map(|ip| ip.to_string()),
        url,
        folder: shared.as_ref().map(|s| s.dest_dir.to_string_lossy().into_owned()),
        phone: shared.as_ref().and_then(|s| s.phone()),
        incoming: shared.as_ref().map(|s| s.incoming()).unwrap_or_default(),
        outgoing: outgoing::list(),
        zips: shared.as_ref().map(|s| s.zips()).unwrap_or_default(),
        received_total,
        sent_total,
        stop_reason: reason,
    }
}

/// The Mac page's ✕ on an incoming file: the phone gets a 410 and stops
pub fn cancel_upload(id: &str) -> Result<(), String> {
    let shared = lock(&SERVER).as_ref().map(|r| r.shared.clone()).ok_or("Wi-Fi ulanish o'chiq")?;
    let up = shared.find_upload(id).ok_or("Bu fayl topilmadi")?;
    up.cancel(upload::CancelBy::Mac).map_err(|e| e.1)
}

pub fn add_outgoing(paths: &[String]) -> Vec<OutgoingView> {
    outgoing::add(paths)
}

pub fn remove_outgoing(id: u32) {
    outgoing::remove(id)
}

pub fn clear_outgoing() {
    outgoing::clear()
}

fn preview_dir() -> PathBuf {
    std::env::temp_dir().join("wireshift-wifi-previews")
}

/// "out-<n>" = a file on the send list, "in-<id>" = a file the phone already sent
fn preview_source(key: &str) -> Option<PathBuf> {
    if let Some(n) = key.strip_prefix("out-") {
        return outgoing::get(n.parse().ok()?).map(|e| e.path);
    }
    let id = key.strip_prefix("in-")?;
    let shared = lock(&SERVER).as_ref().map(|r| r.shared.clone()).or_else(|| lock(&LAST).as_ref().map(|l| l.0.clone()))?;
    let saved = shared.find_upload(id)?.view().saved_as?;
    Some(shared.dest_dir.join(saved))
}

const PREVIEW_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

/// Quick Look thumbnail (photos and videos) for the Mac page, as a data: URL
pub async fn preview(key: &str) -> Result<String, String> {
    use base64::Engine;
    let src = preview_source(key).ok_or("Fayl topilmadi")?;
    let dir = preview_dir().join(names::sanitize_file_name(key));
    let file_name = src.file_name().ok_or("Fayl nomi yo'q")?.to_string_lossy().into_owned();
    let out = dir.join(format!("{file_name}.png"));
    if !out.exists() {
        tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
        // qlmanage can hang forever on a broken video: give up after a few seconds and kill it
        let child = tokio::process::Command::new("/usr/bin/qlmanage")
            .args(["-t", "-s", "160", "-o"])
            .arg(&dir)
            .arg(&src)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .status();
        match tokio::time::timeout(PREVIEW_TIMEOUT, child).await {
            Ok(status) => {
                status.map_err(|e| e.to_string())?;
            }
            Err(_) => {
                tracing::warn!(file = %src.display(), "wifi: quick look preview timed out");
                return Err("Ko'rinish yo'q".into());
            }
        }
    }
    let bytes = tokio::fs::read(&out).await.map_err(|_| "Ko'rinish yo'q".to_string())?;
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod e2e {
    use std::time::Duration;

    /// Manual end-to-end run on the real LAN address (simulate the phone with curl/scripts):
    /// WS_E2E_DIR=<export dir> WS_E2E_SECS=120 WS_E2E_OUT=<file:file> \
    ///   cargo test --lib wifi::e2e -- --ignored --nocapture
    #[test]
    #[ignore]
    fn serve_for_manual_test() {
        let dir = std::env::var("WS_E2E_DIR").expect("set WS_E2E_DIR");
        let secs = std::env::var("WS_E2E_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(60);
        if let Ok(out) = std::env::var("WS_E2E_OUT") {
            super::add_outgoing(&out.split(':').map(String::from).collect::<Vec<_>>());
        }
        // WS_E2E_CTL: a file the test writes an upload id into = the Mac page's ✕
        let ctl = std::env::var("WS_E2E_CTL").ok();
        tauri::async_runtime::block_on(async move {
            let info = super::start(dir.into(), "Wi-Fi e2e").await.expect("server start");
            println!("WS_E2E_URL={}", info.url);
            let deadline = std::time::Instant::now() + Duration::from_secs(secs);
            while std::time::Instant::now() < deadline {
                tokio::time::sleep(Duration::from_millis(150)).await;
                if let Some(p) = &ctl {
                    let _ = std::fs::write(format!("{p}.status.json"), serde_json::to_string(&super::status()).unwrap_or_default());
                }
                let Some(cmd) = ctl.as_ref().and_then(|p| std::fs::read_to_string(p).ok()) else { continue };
                let _ = std::fs::remove_file(ctl.as_ref().unwrap());
                if cmd.trim() == "STOP" {
                    super::stop(None); // the Mac page's global "To'xtatish"
                    println!("WS_E2E_MAC_STOP");
                    tokio::time::sleep(Duration::from_millis(1500)).await;
                    break;
                }
                println!("WS_E2E_MAC_CANCEL {} -> {:?}", cmd.trim(), super::cancel_upload(cmd.trim()));
            }
            println!("WS_E2E_STATUS={}", serde_json::to_string(&super::status()).unwrap_or_default());
            super::stop(None);
            tokio::time::sleep(Duration::from_millis(800)).await;
        });
    }
}

#[cfg(test)]
mod preview_timeout {
    // A process that never ends must be killed by the timeout, not leak (regression: hung qlmanage)
    #[test]
    fn hung_child_is_killed_after_timeout() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let pid_alive = rt.block_on(async {
            let mut cmd = tokio::process::Command::new("/bin/sleep");
            cmd.arg("600").kill_on_drop(true);
            let child = cmd.spawn().unwrap();
            let pid = child.id().unwrap();
            let waited = tokio::time::timeout(std::time::Duration::from_millis(200), child.wait_with_output()).await;
            assert!(waited.is_err());
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            std::process::Command::new("kill").args(["-0", &pid.to_string()]).status().unwrap().success()
        });
        assert!(!pid_alive, "sleep 600 should be gone after the timeout");
    }
}
