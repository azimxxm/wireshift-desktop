//! Mac ↔ Mac: send big files and folders between two Macs running WireShift.
//! Bonjour finds the other Mac, the receiver says yes once, chunks go over
//! several TCP streams (Wi-Fi or a Thunderbolt cable) and a dropped link resumes by itself.

mod discovery;
mod netinfo;
mod proto;
mod receiver;
mod sender;
mod store;

use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

pub use netinfo::NetInfo;
pub use sender::Picked;

/// fixed port when free, so firewalls see the same rule every time
const PREFERRED_PORT: u16 = 47820;

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static SERVICE: Mutex<Option<Service>> = Mutex::new(None);

struct Service {
    stop: CancellationToken,
}

#[derive(Serialize, Clone)]
pub struct Me {
    pub id: String,
    pub name: String,
    pub model: String,
    pub receive_dir: String,
    /// visible on the network (the user pressed "Boshlash")
    pub online: bool,
    pub starting: bool,
    pub net: Option<netinfo::NetInfo>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct SendView {
    pub peer_id: String,
    pub peer_name: String,
    pub peer_model: String,
    /// connecting | waiting | sending | paused | reconnecting | done | declined | failed | cancelled
    pub state: &'static str,
    pub message: Option<String>,
    pub code: String,
    pub total: u64,
    pub done: u64,
    /// raw network byte counter, the UI turns it into speed
    pub counter: u64,
    pub files: usize,
    pub roots: Vec<String>,
    pub current: Option<String>,
    pub link: Option<&'static str>,
    pub elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct RecvView {
    pub from_name: String,
    pub from_model: String,
    /// receiving | paused | interrupted | done | failed | cancelled
    pub state: &'static str,
    pub message: Option<String>,
    pub total: u64,
    pub done: u64,
    pub counter: u64,
    pub files: usize,
    pub roots: Vec<String>,
    pub folder: String,
    pub elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct MacLinkStatus {
    pub me: Me,
    pub peers: Vec<discovery::Peer>,
    pub send: Option<SendView>,
    pub receive: Option<RecvView>,
    pub request: Option<receiver::RequestView>,
    pub trusted: Vec<String>,
}

static START_ERROR: Mutex<Option<String>> = Mutex::new(None);

static STARTING: AtomicBool = AtomicBool::new(false);

/// Runs at app launch. Nothing is opened on the network yet, only the slow
/// Mac name / model lookup is done early so "Boshlash" reacts at once.
pub fn init(app: tauri::AppHandle) {
    let _ = APP.set(app);
    std::thread::spawn(|| {
        let _ = (store::computer_name(), store::model_name());
        netinfo::current();
    });
}

pub fn is_running() -> bool {
    SERVICE.lock().unwrap_or_else(|p| p.into_inner()).is_some()
}

/// "Boshlash": open the port and appear on the network
pub async fn start() -> Result<(), String> {
    if is_running() || STARTING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    *START_ERROR.lock().unwrap_or_else(|p| p.into_inner()) = None;
    let result = start_service().await;
    STARTING.store(false, Ordering::SeqCst);
    if let Err(e) = &result {
        tracing::warn!("maclink: not started: {e}");
        *START_ERROR.lock().unwrap_or_else(|p| p.into_inner()) = Some(e.clone());
    }
    result
}

/// "To'xtatish": disappear from the network; refused while files are moving
pub fn turn_off() -> Result<(), String> {
    if sender::active().is_some_and(|s| !s.is_finished()) || receiver::is_busy() {
        return Err("Avval joriy yuborishni tugating yoki bekor qiling".into());
    }
    stop();
    Ok(())
}

async fn start_service() -> Result<(), String> {
    let any = |port| tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, port)));
    let listener = match any(PREFERRED_PORT).await {
        Ok(l) => l,
        Err(_) => any(0).await.map_err(|e| format!("Port ochilmadi: {e}"))?,
    };
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    // system_profiler is slow, keep it off the async threads
    let (id, name, model) = tokio::task::spawn_blocking(|| (store::my_id(), store::display_name(), store::model_name()))
        .await
        .map_err(|e| e.to_string())?;
    discovery::start(port, &id, &name, &model)?;
    let stop = CancellationToken::new();
    tauri::async_runtime::spawn(receiver::serve(listener, Arc::new(bring_to_front), stop.clone()));
    // keep the announced band / channel up to date while we are visible
    let watch = stop.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = watch.cancelled() => return,
                _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => { netinfo::current(); }
            }
        }
    });
    *SERVICE.lock().unwrap_or_else(|p| p.into_inner()) = Some(Service { stop });
    tracing::info!(port, "maclink: listening");
    Ok(())
}

pub fn stop() {
    if let Some(s) = SERVICE.lock().unwrap_or_else(|p| p.into_inner()).take() {
        s.stop.cancel();
    }
    sender::cancel();
    discovery::stop();
}

/// Someone wants to send: show the window so the dialog is seen
fn bring_to_front() {
    let Some(w) = APP.get().and_then(|a| a.get_webview_window("main")) else { return };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.request_user_attention(Some(tauri::UserAttentionType::Critical));
}

fn ms(i: std::time::Instant, end: Option<std::time::Instant>) -> u64 {
    end.unwrap_or_else(std::time::Instant::now).duration_since(i).as_millis() as u64
}

fn send_view() -> Option<SendView> {
    use sender::SendState as S;
    let s = sender::active()?;
    let st = s.state.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let (state, message) = match st {
        S::Connecting => ("connecting", None),
        S::Waiting => ("waiting", None),
        S::Sending => ("sending", None),
        S::Paused => ("paused", None),
        S::Reconnecting(m) => ("reconnecting", Some(m)),
        S::Done => ("done", None),
        S::Declined(m) => ("declined", Some(m)),
        S::Failed(m) => ("failed", Some(m)),
        S::Cancelled(m) => ("cancelled", Some(m)),
    };
    let link = *s.link.lock().unwrap_or_else(|p| p.into_inner());
    let finished = *s.finished.lock().unwrap_or_else(|p| p.into_inner());
    let current = s.manifest.files.get(s.current_file.load(Ordering::Relaxed)).map(|f| f.path.clone());
    Some(SendView {
        peer_id: s.peer_id.clone(),
        peer_name: s.peer_name.clone(),
        peer_model: s.peer_model.clone(),
        state,
        message,
        code: s.code.clone(),
        total: s.manifest.total,
        done: s.acked_bytes.load(Ordering::Relaxed),
        counter: s.counter.load(Ordering::Relaxed),
        files: s.manifest.files.len(),
        roots: s.manifest.roots.iter().take(5).cloned().collect(),
        current,
        link,
        elapsed_ms: ms(s.started, finished),
    })
}

fn recv_view() -> Option<RecvView> {
    use receiver::RecvState as R;
    let s = receiver::active()?;
    let st = s.state.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let (state, message) = match st {
        R::Receiving => ("receiving", None),
        R::Paused => ("paused", None),
        R::Interrupted => ("interrupted", None),
        R::Done => ("done", None),
        R::Failed(m) => ("failed", Some(m)),
        R::Cancelled(m) => ("cancelled", Some(m)),
    };
    let finished = *s.finished.lock().unwrap_or_else(|p| p.into_inner());
    Some(RecvView {
        from_name: s.from_name.clone(),
        from_model: s.from_model.clone(),
        state,
        message,
        total: s.manifest.total,
        done: s.done_bytes.load(Ordering::Relaxed),
        counter: s.counter.load(Ordering::Relaxed),
        files: s.manifest.files.len(),
        roots: s.manifest.roots.iter().take(5).cloned().collect(),
        folder: s.reveal_path().to_string_lossy().into_owned(),
        elapsed_ms: ms(s.started, finished),
    })
}

pub fn status() -> MacLinkStatus {
    let online = is_running();
    MacLinkStatus {
        me: Me {
            id: store::my_id(),
            name: store::display_name(),
            model: store::model_name(),
            receive_dir: store::receive_dir().to_string_lossy().into_owned(),
            online,
            starting: STARTING.load(Ordering::SeqCst),
            net: netinfo::peek(),
            error: START_ERROR.lock().unwrap_or_else(|p| p.into_inner()).clone(),
        },
        peers: discovery::peers(),
        send: send_view(),
        receive: recv_view(),
        request: receiver::request(),
        trusted: store::trusted_names(),
    }
}

/// The Mac ↔ Mac page asks for this while it is open (refreshes in the background)
pub fn network() -> Option<netinfo::NetInfo> {
    netinfo::current()
}

pub fn inspect(paths: &[String]) -> Vec<Picked> {
    sender::inspect(paths)
}

pub fn send(peer_id: &str, paths: Vec<String>) -> Result<(), String> {
    sender::start(peer_id, paths)
}

pub fn pause(on: bool) {
    sender::pause(on)
}

pub fn cancel_send() {
    sender::cancel()
}

pub fn retry_send() -> Result<(), String> {
    sender::retry()
}

pub fn respond(id: &str, accept: bool, trust: bool) -> Result<(), String> {
    receiver::respond(id, accept, trust)
}

pub fn cancel_receive() {
    receiver::cancel()
}

/// "Yopish" on finished cards
pub fn clear_finished() {
    sender::clear();
    receiver::clear();
}

pub fn set_receive_dir(dir: &str) -> Result<(), String> {
    let p = std::path::Path::new(dir);
    if !p.is_dir() {
        return Err("Papka topilmadi".into());
    }
    store::set_receive_dir(dir);
    Ok(())
}

/// Rename this Mac; other Macs see the new name within a second or two
pub fn set_name(name: &str) -> Result<String, String> {
    let name = store::set_display_name(name)?;
    discovery::set_name(&name);
    Ok(name)
}

pub fn forget_trusted() {
    store::forget_trusted()
}

/// Folder of the current (or last) incoming transfer
pub fn received_folder() -> Option<String> {
    receiver::active().map(|s| s.reveal_path().to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn write_file(path: &std::path::Path, len: usize, seed: u8) {
        let data: Vec<u8> = (0..len).map(|i| (i as u8).wrapping_mul(31).wrapping_add(seed)).collect();
        std::fs::write(path, data).unwrap();
    }

    /// Whole flow over loopback: offer, accept dialog, 4 streams, a dropped link
    /// in the middle that resumes by itself, finish, files renamed.
    /// One test on purpose: HOME and the transfer slots are process-wide.
    #[test]
    fn sends_folder_end_to_end() {
        let _ = tracing_subscriber::fmt().with_test_writer().try_init();
        let home = std::env::temp_dir().join(format!("ws-maclink-e2e-{}", proto::random_hex(4)));
        std::fs::create_dir_all(home.join("Downloads")).unwrap();
        // the store reads HOME once, before anything else touches it
        std::env::set_var("HOME", &home);

        let src = home.join("src/Kino");
        std::fs::create_dir_all(src.join("bo'sh papka")).unwrap();
        std::fs::create_dir_all(src.join("ichki")).unwrap();
        write_file(&src.join("katta.mov"), (proto::CHUNK_SIZE * 12 + 12345) as usize, 7);
        write_file(&src.join("ichki/kichik.txt"), 10, 1);
        std::fs::write(src.join("bo'sh.txt"), b"").unwrap();

        tauri::async_runtime::block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let stop = CancellationToken::new();
            let accept = Arc::new(|| {
                std::thread::spawn(|| {
                    for _ in 0..100 {
                        if let Some(r) = receiver::request() {
                            receiver::respond(&r.id, true, false).unwrap();
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(20));
                    }
                });
            });
            tauri::async_runtime::spawn(receiver::serve(listener, accept, stop.clone()));
            discovery::insert_for_test("peer-1", addr);

            sender::start("peer-1", vec![src.to_string_lossy().into_owned()]).unwrap();
            let t0 = Instant::now();

            // pause once something arrived, cut the link, then let it continue
            while send_view().unwrap().done == 0 {
                assert!(t0.elapsed() < Duration::from_secs(10), "nothing arrived");
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            pause(true);
            tokio::time::sleep(Duration::from_millis(300)).await;
            let before = send_view().unwrap().done;
            assert!(before < send_view().unwrap().total, "finished before the link drop");
            receiver::drop_link_for_test();
            let mut saw_reconnect = false;
            for _ in 0..200 {
                let st = send_view().unwrap().state;
                saw_reconnect |= st == "reconnecting";
                if saw_reconnect && (st == "paused" || st == "sending") {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            assert!(saw_reconnect, "sender never noticed the drop");
            pause(false);
            loop {
                let v = send_view().unwrap();
                match v.state {
                    "done" => break,
                    "failed" | "declined" | "cancelled" => panic!("send ended: {} {:?}", v.state, v.message),
                    _ => {}
                }
                assert!(t0.elapsed() < Duration::from_secs(30), "timed out in {}", v.state);
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            // resumed, not restarted: the chunks it had before the drop were not sent again
            let v = send_view().unwrap();
            assert!(v.counter < v.total, "counter {} total {} before {}", v.counter, v.total, before);
            stop.cancel();
        });

        let out = home.join("Downloads/Kino");
        assert_eq!(std::fs::read(out.join("katta.mov")).unwrap(), std::fs::read(src.join("katta.mov")).unwrap());
        assert_eq!(std::fs::read(out.join("ichki/kichik.txt")).unwrap().len(), 10);
        assert!(out.join("bo'sh.txt").exists());
        assert!(out.join("bo'sh papka").is_dir());
        assert!(!out.join("katta.mov.wspart").exists());
        // a finish that races the closing data streams must not start a second copy
        assert!(!home.join("Downloads/Kino 2").exists(), "sent twice");
        assert_eq!(recv_view().unwrap().state, "done");
        let _ = std::fs::remove_dir_all(home);
    }
}
