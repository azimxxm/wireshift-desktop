//! The receiving Mac: accepts offers, writes chunks in place, keeps a resume file on disk.

use super::proto::{self, read_msg, write_msg, Chunk, Manifest, Msg};
use super::store;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

const HELLO_TIMEOUT: Duration = Duration::from_secs(15);
/// the sender pings every few seconds; silence this long = the link is gone
const CONTROL_TIMEOUT: Duration = Duration::from_secs(20);
/// nobody answered the dialog
const DECISION_TIMEOUT: Duration = Duration::from_secs(120);
const SAVE_EVERY_CHUNKS: u32 = 32;
pub const PART_SUFFIX: &str = ".wspart";

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------- accept dialog ----------

pub struct Request {
    pub id: String,
    pub from_name: String,
    pub from_model: String,
    pub code: String,
    pub total: u64,
    pub files: usize,
    pub roots: Vec<String>,
    pub resume_bytes: u64,
    answer: Mutex<Option<oneshot::Sender<(bool, bool)>>>,
}

#[derive(Serialize, Clone)]
pub struct RequestView {
    pub id: String,
    pub from_name: String,
    pub from_model: String,
    pub code: String,
    pub total: u64,
    pub files: usize,
    pub roots: Vec<String>,
    pub resume_bytes: u64,
}

static PENDING: Mutex<Option<Arc<Request>>> = Mutex::new(None);

pub fn request() -> Option<RequestView> {
    lock(&PENDING).as_ref().map(|r| RequestView {
        id: r.id.clone(),
        from_name: r.from_name.clone(),
        from_model: r.from_model.clone(),
        code: r.code.clone(),
        total: r.total,
        files: r.files,
        roots: r.roots.clone(),
        resume_bytes: r.resume_bytes,
    })
}

/// The user clicked Accept / Decline
pub fn respond(id: &str, accept: bool, trust: bool) -> Result<(), String> {
    let req = lock(&PENDING).clone().filter(|r| r.id == id).ok_or("So'rov eskirgan")?;
    if let Some(tx) = lock(&req.answer).take() {
        let _ = tx.send((accept, trust));
    }
    Ok(())
}

// ---------- session ----------

#[derive(Clone, PartialEq, Debug)]
pub enum RecvState {
    Receiving,
    Paused,
    /// link dropped, waiting for the sender to come back
    Interrupted,
    Done,
    Failed(String),
    Cancelled(String),
}

/// What survives an app restart (one JSON per transfer in Application Support)
#[derive(Serialize, Deserialize, Clone)]
struct Saved {
    manifest: Manifest,
    from_id: String,
    from_name: String,
    from_model: String,
    token: String,
    dest: PathBuf,
    root_map: HashMap<String, String>,
    done: Vec<u32>,
}

pub struct Session {
    pub manifest: Manifest,
    chunks: Vec<Chunk>,
    pub from_id: String,
    pub from_name: String,
    pub from_model: String,
    token: Mutex<String>,
    pub dest: PathBuf,
    root_map: HashMap<String, String>,
    done: Mutex<HashSet<u32>>,
    pub done_bytes: AtomicU64,
    /// bytes over the network in this run (speed meter)
    pub counter: AtomicU64,
    pub state: Mutex<RecvState>,
    /// current control connection; replaced when the sender reconnects
    attempt: Mutex<CancellationToken>,
    /// the user pressed cancel on this Mac
    local_cancel: CancellationToken,
    pub started: Instant,
    pub finished: Mutex<Option<Instant>>,
}

static ACTIVE: Mutex<Option<Arc<Session>>> = Mutex::new(None);

pub fn active() -> Option<Arc<Session>> {
    lock(&ACTIVE).clone()
}

fn saved_path(manifest_id: &str) -> PathBuf {
    store::support_dir().join(format!("recv-{}.json", manifest_id.chars().filter(char::is_ascii_hexdigit).collect::<String>()))
}

fn load_saved(manifest_id: &str, from_id: &str) -> Option<Saved> {
    let s: Saved = serde_json::from_slice(&std::fs::read(saved_path(manifest_id)).ok()?).ok()?;
    (s.from_id == from_id && s.manifest.id == manifest_id).then_some(s)
}

impl Session {
    fn is_finished(&self) -> bool {
        matches!(*lock(&self.state), RecvState::Done | RecvState::Failed(_) | RecvState::Cancelled(_))
    }

    fn set_state(&self, s: RecvState) {
        let mut cur = lock(&self.state);
        // a finished session never comes back to life
        if !matches!(*cur, RecvState::Done | RecvState::Failed(_) | RecvState::Cancelled(_)) {
            *cur = s;
        }
    }

    fn token_matches(&self, given: &str) -> bool {
        proto::constant_eq(&lock(&self.token), given)
    }

    /// "Photos/2024/a.mov" -> <dest>/<Photos or "Photos 2">/2024/a.mov
    fn target(&self, rel: &str) -> PathBuf {
        let (first, rest) = rel.split_once('/').unwrap_or((rel, ""));
        let root = self.root_map.get(first).map(String::as_str).unwrap_or(first);
        let base = self.dest.join(root);
        if rest.is_empty() {
            base
        } else {
            base.join(rest)
        }
    }

    fn part_path(&self, file: usize) -> PathBuf {
        let mut p = self.target(&self.manifest.files[file].path).into_os_string();
        p.push(PART_SUFFIX);
        PathBuf::from(p)
    }

    /// Folder (or file) to show in Finder
    pub fn reveal_path(&self) -> PathBuf {
        match self.manifest.roots.as_slice() {
            [one] => self.target(one),
            _ => self.dest.clone(),
        }
    }

    fn save(&self) {
        let saved = Saved {
            manifest: self.manifest.clone(),
            from_id: self.from_id.clone(),
            from_name: self.from_name.clone(),
            from_model: self.from_model.clone(),
            token: lock(&self.token).clone(),
            dest: self.dest.clone(),
            root_map: self.root_map.clone(),
            done: lock(&self.done).iter().copied().collect(),
        };
        let _ = std::fs::create_dir_all(store::support_dir());
        match serde_json::to_vec(&saved) {
            Ok(b) => {
                if let Err(e) = std::fs::write(saved_path(&self.manifest.id), b) {
                    tracing::warn!("maclink: resume file not saved: {e}");
                }
            }
            Err(e) => tracing::warn!("maclink: resume file not encoded: {e}"),
        }
    }

    fn missing(&self) -> Vec<u32> {
        let done = lock(&self.done);
        (0..self.chunks.len() as u32).filter(|c| !done.contains(c)).collect()
    }

    /// Partial files are useless after a cancel: remove them and the resume file
    fn discard(&self) {
        for i in 0..self.manifest.files.len() {
            let _ = std::fs::remove_file(self.part_path(i));
        }
        // folders we created stay only if something real is inside
        let mut dirs: Vec<PathBuf> = self.manifest.dirs.iter().map(|d| self.target(d)).collect();
        dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
        for d in dirs {
            let _ = std::fs::remove_dir(d); // only succeeds when empty
        }
        let _ = std::fs::remove_file(saved_path(&self.manifest.id));
    }

    /// Every chunk is on disk: give the files their real names
    fn finalize(&self) -> Result<(), String> {
        for d in &self.manifest.dirs {
            std::fs::create_dir_all(self.target(d)).map_err(|e| format!("Papka yaratilmadi: {e}"))?;
        }
        for (i, f) in self.manifest.files.iter().enumerate() {
            let target = self.target(&f.path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            if f.size == 0 {
                std::fs::File::create(&target).map_err(|e| format!("{}: {e}", f.path))?;
                continue;
            }
            let part = self.part_path(i);
            let len = std::fs::metadata(&part).map(|m| m.len()).map_err(|e| format!("{}: {e}", f.path))?;
            if len != f.size {
                return Err(format!("{}: hajm mos emas ({len} / {})", f.path, f.size));
            }
            std::fs::rename(&part, &target).map_err(|e| format!("{}: {e}", f.path))?;
        }
        let _ = std::fs::remove_file(saved_path(&self.manifest.id));
        Ok(())
    }
}

/// "Photos" -> "Photos 2" when something with that name is already in the folder
fn unique_root(dest: &Path, name: &str, taken: &HashSet<String>) -> String {
    let free = |n: &str| {
        let p = dest.join(n);
        let mut part = p.clone().into_os_string();
        part.push(PART_SUFFIX);
        !taken.contains(n) && !p.exists() && !Path::new(&part).exists()
    };
    if free(name) {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && e.len() <= 8 && !dest.join(name).is_dir() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (2..10_000).map(|n| format!("{stem} {n}{ext}")).find(|n| free(n)).unwrap_or_else(|| format!("{stem} {}", proto::random_hex(3)))
}

fn new_session(saved: Option<Saved>, offer: &OfferInfo) -> Arc<Session> {
    let token = proto::random_hex(16);
    let (dest, root_map, done) = match saved {
        Some(s) => (s.dest, s.root_map, s.done.into_iter().collect::<HashSet<u32>>()),
        None => {
            let dest = store::receive_dir();
            let mut taken = HashSet::new();
            let map = offer
                .manifest
                .roots
                .iter()
                .map(|r| {
                    let name = unique_root(&dest, r, &taken);
                    taken.insert(name.clone());
                    (r.clone(), name)
                })
                .collect();
            (dest, map, HashSet::new())
        }
    };
    let chunks = offer.manifest.chunks();
    let done_bytes = done.iter().filter_map(|c| chunks.get(*c as usize)).map(|c| c.len).sum();
    Arc::new(Session {
        manifest: offer.manifest.clone(),
        chunks,
        from_id: offer.from_id.clone(),
        from_name: offer.from_name.clone(),
        from_model: offer.from_model.clone(),
        token: Mutex::new(token),
        dest,
        root_map,
        done: Mutex::new(done),
        done_bytes: AtomicU64::new(done_bytes),
        counter: AtomicU64::new(0),
        state: Mutex::new(RecvState::Receiving),
        attempt: Mutex::new(CancellationToken::new()),
        local_cancel: CancellationToken::new(),
        started: Instant::now(),
        finished: Mutex::new(None),
    })
}

/// Files are arriving right now (an interrupted transfer does not count)
pub fn is_busy() -> bool {
    active().is_some_and(|s| matches!(*lock(&s.state), RecvState::Receiving | RecvState::Paused))
}

/// ✕ on the receiving Mac
pub fn cancel() {
    let Some(s) = active() else { return };
    if s.is_finished() {
        return;
    }
    s.local_cancel.cancel();
    // no live link to tell the sender: clean up right here
    if *lock(&s.state) == RecvState::Interrupted {
        s.discard();
        s.set_state(RecvState::Cancelled("Siz bekor qildingiz".into()));
        *lock(&s.finished) = Some(Instant::now());
    }
}

/// Simulates Wi-Fi dropping: the live link (control + data streams) ends at once
#[cfg(test)]
pub fn drop_link_for_test() {
    if let Some(s) = active() {
        lock(&s.attempt).cancel();
    }
}

/// "Yopish" on a finished card
pub fn clear() {
    let mut a = lock(&ACTIVE);
    if a.as_ref().is_some_and(|s| s.is_finished()) {
        *a = None;
    }
}

// ---------- network ----------

pub async fn serve(listener: TcpListener, on_request: Arc<dyn Fn() + Send + Sync>, stop: CancellationToken) {
    loop {
        let conn = tokio::select! {
            _ = stop.cancelled() => return,
            c = listener.accept() => c,
        };
        match conn {
            Ok((stream, addr)) => {
                let cb = on_request.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle(stream, cb).await {
                        tracing::info!(%addr, "maclink connection ended: {e}");
                    }
                });
            }
            Err(e) => {
                tracing::warn!("maclink accept failed: {e}");
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        }
    }
}

struct OfferInfo {
    from_id: String,
    from_name: String,
    from_model: String,
    code: String,
    secret: Option<String>,
    resume_token: Option<String>,
    manifest: Manifest,
}

async fn handle(mut stream: TcpStream, on_request: Arc<dyn Fn() + Send + Sync>) -> Result<(), String> {
    let first = tokio::time::timeout(HELLO_TIMEOUT, read_msg(&mut stream))
        .await
        .map_err(|_| "no hello".to_string())?
        .map_err(|e| e.to_string())?;
    match first {
        Msg::Offer { v, from_id, from_name, from_model, code, secret, resume_token, manifest } => {
            if v != proto::PROTO_VERSION {
                let reason = "WireShift versiyalari har xil — ikkala Mac'da ham ilovani yangilang".to_string();
                let _ = write_msg(&mut stream, &Msg::Decline { reason }).await;
                return Ok(());
            }
            let offer = OfferInfo { from_id, from_name, from_model, code, secret, resume_token, manifest };
            control(stream, offer, on_request).await
        }
        Msg::Data { token } => data(stream, &token).await,
        _ => Err("unexpected first message".into()),
    }
}

async fn decline(stream: &mut TcpStream, reason: &str) -> Result<(), String> {
    let _ = write_msg(stream, &Msg::Decline { reason: reason.to_string() }).await;
    Ok(())
}

/// Ask the user; also gives up if the sender hangs up while the dialog is open
async fn ask_user(stream: &mut TcpStream, offer: &OfferInfo, resume_bytes: u64, on_request: &(dyn Fn() + Send + Sync)) -> Option<(bool, bool)> {
    let (tx, rx) = oneshot::channel();
    let req = Arc::new(Request {
        id: proto::random_hex(8),
        from_name: offer.from_name.clone(),
        from_model: offer.from_model.clone(),
        code: offer.code.clone(),
        total: offer.manifest.total,
        files: offer.manifest.files.len(),
        roots: offer.manifest.roots.iter().take(5).cloned().collect(),
        resume_bytes,
        answer: Mutex::new(Some(tx)),
    });
    {
        let mut p = lock(&PENDING);
        if p.is_some() {
            return Some((false, false));
        }
        *p = Some(req.clone());
    }
    on_request();
    let mut probe = [0u8; 1];
    let answer = tokio::select! {
        a = rx => a.ok(),
        _ = tokio::time::sleep(DECISION_TIMEOUT) => Some((false, false)),
        // sender cancelled (or closed) before anyone answered
        _ = stream.read(&mut probe) => None,
    };
    let mut p = lock(&PENDING);
    if p.as_ref().is_some_and(|r| Arc::ptr_eq(r, &req)) {
        *p = None;
    }
    answer
}

async fn control(mut stream: TcpStream, offer: OfferInfo, on_request: Arc<dyn Fn() + Send + Sync>) -> Result<(), String> {
    let _ = stream.set_nodelay(true);
    if let Err(e) = offer.manifest.validate() {
        return decline(&mut stream, &e).await;
    }

    // the link dropped right after we finished: the sender missed our Done, say it again
    if let Some(s) = active().filter(|s| *lock(&s.state) == RecvState::Done) {
        let same = s.manifest.id == offer.manifest.id && s.from_id == offer.from_id;
        if same && offer.resume_token.as_deref().is_some_and(|t| s.token_matches(t)) {
            return confirm_done(stream, &s).await;
        }
    }

    // the same transfer coming back after a dropped link
    if let Some(s) = active().filter(|s| !s.is_finished()) {
        let same = s.manifest.id == offer.manifest.id && s.from_id == offer.from_id;
        let allowed = offer.resume_token.as_deref().is_some_and(|t| s.token_matches(t))
            || store::is_trusted(&offer.from_id, offer.secret.as_deref());
        let interrupted = *lock(&s.state) == RecvState::Interrupted;
        if same && allowed && interrupted {
            return run_control(stream, s, None).await;
        }
        if !interrupted {
            return decline(&mut stream, "Bu Mac hozir boshqa fayllarni qabul qilyapti").await;
        }
        // an abandoned transfer must not block new ones; its resume file stays on disk
        *lock(&ACTIVE) = None;
    }

    let saved = load_saved(&offer.manifest.id, &offer.from_id);
    let resume_bytes = saved.as_ref().map_or(0, |s| {
        let chunks = s.manifest.chunks();
        s.done.iter().filter_map(|c| chunks.get(*c as usize)).map(|c| c.len).sum()
    });
    let auto = saved.as_ref().zip(offer.resume_token.as_deref()).is_some_and(|(s, t)| proto::constant_eq(&s.token, t))
        || store::is_trusted(&offer.from_id, offer.secret.as_deref());

    let mut new_secret = None;
    if !auto {
        match ask_user(&mut stream, &offer, resume_bytes, on_request.as_ref()).await {
            None => return Ok(()),
            Some((false, _)) => return decline(&mut stream, "Qabul qilinmadi").await,
            Some((true, trust)) => {
                if trust {
                    new_secret = Some(store::trust(&offer.from_id, &offer.from_name));
                }
            }
        }
    }

    let dest_dir = saved.as_ref().map(|s| s.dest.clone()).unwrap_or_else(store::receive_dir);
    if let Err(e) = std::fs::create_dir_all(&dest_dir) {
        return decline(&mut stream, &format!("Qabul papkasi ochilmadi: {e}")).await;
    }
    let need = offer.manifest.total.saturating_sub(resume_bytes);
    if let Some(free) = store::free_space(&dest_dir) {
        if free < need + 512 * 1024 * 1024 {
            let reason = format!(
                "Qabul qiluvchi Mac'da joy yetarli emas: {} kerak, {} bo'sh",
                human(need),
                human(free)
            );
            return decline(&mut stream, &reason).await;
        }
    }

    let session = new_session(saved, &offer);
    for d in &session.manifest.dirs {
        let _ = std::fs::create_dir_all(session.target(d));
    }
    session.save();
    *lock(&ACTIVE) = Some(session.clone());
    tracing::info!(from = %session.from_name, files = session.manifest.files.len(), total = session.manifest.total, "maclink: receiving");
    run_control(stream, session, new_secret).await
}

fn human(b: u64) -> String {
    format!("{:.1} GB", b as f64 / 1_073_741_824.0)
}

/// Accept with every chunk done, then answer the sender's Finish with Done
async fn confirm_done(mut stream: TcpStream, s: &Arc<Session>) -> Result<(), String> {
    let token = lock(&s.token).clone();
    let done = (0..s.chunks.len() as u32).collect();
    write_msg(&mut stream, &Msg::Accept { token, secret: None, done }).await.map_err(|e| e.to_string())?;
    loop {
        let m = tokio::time::timeout(CONTROL_TIMEOUT, read_msg(&mut stream))
            .await
            .map_err(|_| "control timeout".to_string())?
            .map_err(|e| e.to_string())?;
        match m {
            Msg::Finish => return write_msg(&mut stream, &Msg::Done).await.map_err(|e| e.to_string()),
            Msg::Ping => write_msg(&mut stream, &Msg::Ping).await.map_err(|e| e.to_string())?,
            _ => {}
        }
    }
}

async fn run_control(mut stream: TcpStream, s: Arc<Session>, secret: Option<String>) -> Result<(), String> {
    let _awake = store::KeepAwake::new();
    let attempt = {
        let mut a = lock(&s.attempt);
        a.cancel(); // data connections of the old link stop
        *a = CancellationToken::new();
        a.clone()
    };
    let token = {
        let mut t = lock(&s.token);
        *t = proto::random_hex(16);
        t.clone()
    };
    s.counter.store(0, Ordering::Relaxed);
    let done: Vec<u32> = lock(&s.done).iter().copied().collect();
    write_msg(&mut stream, &Msg::Accept { token, secret, done }).await.map_err(|e| e.to_string())?;
    s.set_state(RecvState::Receiving);

    let result = control_loop(&mut stream, &s).await;
    attempt.cancel();
    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            if !s.is_finished() {
                s.save();
                s.set_state(RecvState::Interrupted);
            }
            Err(e)
        }
    }
}

async fn control_loop(stream: &mut TcpStream, s: &Arc<Session>) -> Result<(), String> {
    loop {
        let msg = tokio::select! {
            _ = s.local_cancel.cancelled() => {
                let reason = match &*lock(&s.state) {
                    RecvState::Failed(e) => format!("Qabul qiluvchi Mac: {e}"),
                    _ => "Qabul qiluvchi Mac bekor qildi".to_string(),
                };
                let _ = write_msg(stream, &Msg::Cancel { reason }).await;
                if matches!(*lock(&s.state), RecvState::Failed(_)) {
                    // keep what arrived: after freeing space the same send resumes
                    return Ok(());
                }
                s.discard();
                s.set_state(RecvState::Cancelled("Siz bekor qildingiz".into()));
                *lock(&s.finished) = Some(Instant::now());
                return Ok(());
            }
            m = tokio::time::timeout(CONTROL_TIMEOUT, read_msg(stream)) => {
                m.map_err(|_| "control timeout".to_string())?.map_err(|e| e.to_string())?
            }
        };
        match msg {
            Msg::Ping => write_msg(stream, &Msg::Ping).await.map_err(|e| e.to_string())?,
            Msg::Pause => s.set_state(RecvState::Paused),
            Msg::Resume => s.set_state(RecvState::Receiving),
            Msg::Cancel { .. } => {
                s.discard();
                s.set_state(RecvState::Cancelled(format!("{} bekor qildi", s.from_name)));
                *lock(&s.finished) = Some(Instant::now());
                return Ok(());
            }
            Msg::Finish => {
                let missing = s.missing();
                if !missing.is_empty() {
                    write_msg(stream, &Msg::Missing { chunks: missing }).await.map_err(|e| e.to_string())?;
                    continue;
                }
                let s2 = s.clone();
                let res = tokio::task::spawn_blocking(move || s2.finalize()).await.map_err(|e| e.to_string())?;
                match res {
                    Ok(()) => {
                        let _ = write_msg(stream, &Msg::Done).await;
                        s.set_state(RecvState::Done);
                        tracing::info!("maclink: transfer complete");
                    }
                    Err(e) => {
                        let _ = write_msg(stream, &Msg::Cancel { reason: e.clone() }).await;
                        s.set_state(RecvState::Failed(e));
                    }
                }
                *lock(&s.finished) = Some(Instant::now());
                return Ok(());
            }
            _ => {}
        }
    }
}

/// One data connection: chunk header, raw bytes, write in place, ack
async fn data(stream: TcpStream, token: &str) -> Result<(), String> {
    let s = active().filter(|s| !s.is_finished() && s.token_matches(token)).ok_or("unknown token")?;
    let attempt = lock(&s.attempt).clone();
    let (mut rd, mut wr) = stream.into_split();
    let mut buf = vec![0u8; proto::CHUNK_SIZE as usize];
    let mut open: Option<(usize, std::fs::File)> = None;
    let mut since_save = 0u32;
    loop {
        let msg = tokio::select! {
            _ = attempt.cancelled() => return Ok(()),
            m = read_msg(&mut rd) => m.map_err(|e| e.to_string())?,
        };
        let Msg::Chunk { c, crc } = msg else { continue };
        let chunk = *s.chunks.get(c as usize).ok_or("bad chunk index")?;
        let len = chunk.len as usize;
        let body = &mut buf[..len];
        // read the body piece by piece so the speed meter moves smoothly
        let mut got = 0;
        while got < len {
            let n = tokio::select! {
                _ = attempt.cancelled() => return Ok(()),
                n = rd.read(&mut body[got..]) => n.map_err(|e| e.to_string())?,
            };
            if n == 0 {
                return Err("closed mid-chunk".into());
            }
            got += n;
            s.counter.fetch_add(n as u64, Ordering::Relaxed);
        }
        if crc32fast::hash(body) != crc {
            write_msg(&mut wr, &Msg::Nack { c }).await.map_err(|e| e.to_string())?;
            continue;
        }

        // positional write on a blocking thread; the file handle is kept for the next chunk
        let file = match open.take() {
            Some((i, f)) if i == chunk.file => f,
            _ => {
                let path = s.part_path(chunk.file);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                std::fs::OpenOptions::new().create(true).write(true).truncate(false).open(&path).map_err(|e| e.to_string())?
            }
        };
        let data = std::mem::take(&mut buf);
        let (res, file, data) = tokio::task::spawn_blocking(move || {
            let r = file.write_all_at(&data[..len], chunk.offset);
            (r, file, data)
        })
        .await
        .map_err(|e| e.to_string())?;
        buf = data;
        if let Err(e) = res {
            let msg = if e.raw_os_error() == Some(libc::ENOSPC) { "Diskda joy qolmadi".to_string() } else { format!("Yozib bo'lmadi: {e}") };
            s.save();
            s.set_state(RecvState::Failed(msg));
            *lock(&s.finished) = Some(Instant::now());
            s.local_cancel.cancel();
            return Err(e.to_string());
        }
        open = Some((chunk.file, file));

        if lock(&s.done).insert(c) {
            s.done_bytes.fetch_add(chunk.len, Ordering::Relaxed);
        }
        write_msg(&mut wr, &Msg::Ack { c }).await.map_err(|e| e.to_string())?;
        since_save += 1;
        if since_save >= SAVE_EVERY_CHUNKS {
            since_save = 0;
            let s2 = s.clone();
            tokio::task::spawn_blocking(move || s2.save());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_names_do_not_collide() {
        let dir = std::env::temp_dir().join(format!("ws-maclink-test-{}", proto::random_hex(4)));
        std::fs::create_dir_all(dir.join("Photos")).unwrap();
        std::fs::write(dir.join("a.mov"), b"x").unwrap();
        let mut taken = HashSet::new();
        assert_eq!(unique_root(&dir, "Photos", &taken), "Photos 2");
        assert_eq!(unique_root(&dir, "a.mov", &taken), "a 2.mov");
        taken.insert("b".to_string());
        assert_eq!(unique_root(&dir, "b", &taken), "b 2");
        assert_eq!(unique_root(&dir, "new", &taken), "new");
        let _ = std::fs::remove_dir_all(dir);
    }
}
