//! The sending Mac: builds the file list, pushes chunks over several TCP streams,
//! and reconnects + resumes by itself when the link drops.

use super::discovery;
use super::proto::{self, read_msg, write_msg, Chunk, FileEntry, Manifest, Msg};
use super::store;
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::hash::{Hash, Hasher};
use std::net::SocketAddr;
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::{watch, Notify};
use tokio_util::sync::CancellationToken;

/// parallel streams: one TCP stream rarely fills a 5 GHz link
const STREAMS: usize = 4;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const PING_EVERY: Duration = Duration::from_secs(4);
const REPLY_TIMEOUT: Duration = Duration::from_secs(20);
/// how long we keep trying after the link drops
const GIVE_UP_AFTER: Duration = Duration::from_secs(15 * 60);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------- file list ----------

#[derive(Serialize, Clone)]
pub struct Picked {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub files: usize,
}

struct Walked {
    roots: Vec<String>,
    files: Vec<(FileEntry, PathBuf, u64)>, // entry, source, mtime
    dirs: Vec<String>,
}

fn mtime(meta: &std::fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs())
}

fn skip_name(name: &str) -> bool {
    name == ".DS_Store" || name.ends_with(super::receiver::PART_SUFFIX)
}

fn walk_dir(dir: &Path, rel: &str, out: &mut Walked) -> Result<(), String> {
    out.dirs.push(rel.to_string());
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        if skip_name(&name) {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };
        let child_rel = format!("{rel}/{name}");
        if ft.is_dir() {
            walk_dir(&e.path(), &child_rel, out)?;
        } else if ft.is_file() {
            let meta = e.metadata().map_err(|err| format!("{child_rel}: {err}"))?;
            out.files.push((FileEntry { path: child_rel, size: meta.len() }, e.path(), mtime(&meta)));
        }
        // symlinks and special files are skipped on purpose
    }
    Ok(())
}

fn walk(paths: &[String]) -> Result<Walked, String> {
    let mut out = Walked { roots: vec![], files: vec![], dirs: vec![] };
    let mut seen = HashSet::new();
    for p in paths {
        let path = PathBuf::from(p);
        let meta = std::fs::metadata(&path).map_err(|e| format!("{p}: {e}"))?;
        let base = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Mac".into());
        // two different "Photos" folders -> "Photos", "Photos 2"
        let mut name = base.clone();
        let mut n = 2;
        while !seen.insert(name.clone()) {
            name = format!("{base} {n}");
            n += 1;
        }
        out.roots.push(name.clone());
        if meta.is_dir() {
            walk_dir(&path, &name, &mut out)?;
        } else {
            out.files.push((FileEntry { path: name, size: meta.len() }, path, mtime(&meta)));
        }
    }
    Ok(out)
}

/// Sizes for the "ready to send" list
pub fn inspect(paths: &[String]) -> Vec<Picked> {
    paths
        .iter()
        .filter_map(|p| {
            let w = walk(std::slice::from_ref(p)).ok()?;
            Some(Picked {
                path: p.clone(),
                name: w.roots.first().cloned().unwrap_or_default(),
                is_dir: !w.dirs.is_empty(),
                size: w.files.iter().map(|f| f.0.size).sum(),
                files: w.files.len(),
            })
        })
        .collect()
}

fn manifest_id(w: &Walked, peer_id: &str) -> String {
    let mut parts = [0u64; 2];
    for (seed, slot) in parts.iter_mut().enumerate() {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        (seed, store::my_id(), peer_id).hash(&mut h);
        for (f, _, m) in &w.files {
            (&f.path, f.size, m).hash(&mut h);
        }
        w.dirs.hash(&mut h);
        *slot = h.finish();
    }
    format!("{:016x}{:016x}", parts[0], parts[1])
}

// ---------- session ----------

#[derive(Clone, PartialEq, Debug)]
pub enum SendState {
    Connecting,
    /// the other Mac shows the accept dialog
    Waiting,
    Sending,
    Paused,
    Reconnecting(String),
    Done,
    Declined(String),
    Failed(String),
    Cancelled(String),
}

pub struct Session {
    pub peer_id: String,
    pub peer_name: String,
    pub peer_model: String,
    pub manifest: Manifest,
    chunks: Vec<Chunk>,
    sources: Vec<PathBuf>,
    pub code: String,
    pub state: Mutex<SendState>,
    acked: Mutex<Vec<bool>>,
    pub acked_bytes: AtomicU64,
    /// bytes written to the network (speed meter)
    pub counter: AtomicU64,
    pub current_file: AtomicUsize,
    paused: watch::Sender<bool>,
    cancel: CancellationToken,
    token: Mutex<Option<String>>,
    last_addr: Mutex<Option<SocketAddr>>,
    pub link: Mutex<Option<&'static str>>,
    pub started: Instant,
    pub finished: Mutex<Option<Instant>>,
}

static ACTIVE: Mutex<Option<Arc<Session>>> = Mutex::new(None);

pub fn active() -> Option<Arc<Session>> {
    lock(&ACTIVE).clone()
}

impl Session {
    pub fn is_finished(&self) -> bool {
        matches!(*lock(&self.state), SendState::Done | SendState::Declined(_) | SendState::Failed(_) | SendState::Cancelled(_))
    }

    fn set_state(&self, s: SendState) {
        let mut cur = lock(&self.state);
        if *cur == SendState::Paused && s == SendState::Sending {
            return; // stay paused until the user resumes
        }
        *cur = s;
    }

    fn finish(&self, s: SendState) {
        *lock(&self.state) = s;
        *lock(&self.finished) = Some(Instant::now());
    }

    fn all_acked(&self) -> bool {
        lock(&self.acked).iter().all(|a| *a)
    }
}

pub fn start(peer_id: &str, paths: Vec<String>) -> Result<(), String> {
    if active().is_some_and(|s| !s.is_finished()) {
        return Err("Avval joriy yuborishni tugating yoki bekor qiling".into());
    }
    let peer = discovery::peer(peer_id).ok_or("Bu Mac endi tarmoqda ko'rinmayapti")?;
    let w = walk(&paths)?;
    if w.files.is_empty() && w.dirs.is_empty() {
        return Err("Yuboriladigan fayl yo'q".into());
    }
    let manifest = Manifest {
        id: manifest_id(&w, peer_id),
        roots: w.roots.clone(),
        total: w.files.iter().map(|f| f.0.size).sum(),
        files: w.files.iter().map(|f| f.0.clone()).collect(),
        dirs: w.dirs.clone(),
    };
    let chunks = manifest.chunks();
    let code = format!("{:04}", u16::from_str_radix(&proto::random_hex(2), 16).unwrap_or(0) % 10_000);
    let session = Arc::new(Session {
        peer_id: peer.id.clone(),
        peer_name: peer.name.clone(),
        peer_model: peer.model.clone(),
        acked: Mutex::new(vec![false; chunks.len()]),
        chunks,
        sources: w.files.into_iter().map(|f| f.1).collect(),
        manifest,
        code,
        state: Mutex::new(SendState::Connecting),
        acked_bytes: AtomicU64::new(0),
        counter: AtomicU64::new(0),
        current_file: AtomicUsize::new(0),
        paused: watch::channel(false).0,
        cancel: CancellationToken::new(),
        token: Mutex::new(None),
        last_addr: Mutex::new(None),
        link: Mutex::new(None),
        started: Instant::now(),
        finished: Mutex::new(None),
    });
    *lock(&ACTIVE) = Some(session.clone());
    tauri::async_runtime::spawn(run(session));
    Ok(())
}

pub fn pause(on: bool) {
    if let Some(s) = active().filter(|s| !s.is_finished()) {
        s.paused.send_replace(on);
        let mut st = lock(&s.state);
        match (&*st, on) {
            (SendState::Sending, true) => *st = SendState::Paused,
            (SendState::Paused, false) => *st = SendState::Sending,
            _ => {}
        }
    }
}

pub fn cancel() {
    if let Some(s) = active().filter(|s| !s.is_finished()) {
        s.cancel.cancel();
    }
}

/// "Qayta urinish" after a failure: same files, continues where it stopped
pub fn retry() -> Result<(), String> {
    let s = active().ok_or("Yuborish yo'q")?;
    if !matches!(*lock(&s.state), SendState::Failed(_)) {
        return Err("Qayta urinish shart emas".into());
    }
    *lock(&s.finished) = None;
    *lock(&s.state) = SendState::Connecting;
    tauri::async_runtime::spawn(run(s));
    Ok(())
}

pub fn clear() {
    let mut a = lock(&ACTIVE);
    if a.as_ref().is_some_and(|s| s.is_finished()) {
        *a = None;
    }
}

// ---------- network ----------

enum Stop {
    /// worth trying again (link dropped, timeout)
    Retry(String),
    Fatal(SendState),
}

impl From<std::io::Error> for Stop {
    fn from(e: std::io::Error) -> Self {
        Stop::Retry(e.to_string())
    }
}

async fn run(s: Arc<Session>) {
    let _awake = store::KeepAwake::new();
    let mut last_ok = Instant::now();
    let mut delay = Duration::from_secs(1);
    loop {
        match attempt(&s, &mut last_ok).await {
            Ok(()) => {
                s.finish(SendState::Done);
                tracing::info!(total = s.manifest.total, "maclink: send complete");
                return;
            }
            Err(Stop::Fatal(state)) => {
                s.finish(state);
                return;
            }
            Err(Stop::Retry(why)) => {
                tracing::info!("maclink: link problem, retrying: {why}");
                if last_ok.elapsed() > GIVE_UP_AFTER {
                    s.finish(SendState::Failed(format!("{} bilan aloqa tiklanmadi", s.peer_name)));
                    return;
                }
                s.set_state(SendState::Reconnecting(why));
                tokio::select! {
                    _ = s.cancel.cancelled() => {
                        s.finish(SendState::Cancelled("Siz bekor qildingiz".into()));
                        return;
                    }
                    _ = tokio::time::sleep(delay) => {}
                }
                delay = (delay * 2).min(Duration::from_secs(5));
            }
        }
    }
}

/// Cable address first, then Wi-Fi; the last address that worked goes first
async fn connect(s: &Session) -> Result<(TcpStream, SocketAddr), Stop> {
    let mut addrs = discovery::peer(&s.peer_id).map(|p| p.addrs).unwrap_or_default();
    if let Some(last) = *lock(&s.last_addr) {
        if !addrs.contains(&last) {
            addrs.push(last);
        }
    }
    if addrs.is_empty() {
        return Err(Stop::Retry(format!("{} tarmoqda ko'rinmayapti", s.peer_name)));
    }
    for addr in addrs {
        if let Ok(Ok(stream)) = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
            return Ok((stream, addr));
        }
    }
    Err(Stop::Retry(format!("{} ga ulanib bo'lmadi", s.peer_name)))
}

async fn attempt(s: &Arc<Session>, last_ok: &mut Instant) -> Result<(), Stop> {
    let (mut control, addr) = connect(s).await?;
    let _ = control.set_nodelay(true);
    *lock(&s.last_addr) = Some(addr);
    *lock(&s.link) = Some(if addr.ip().to_string().starts_with("169.254.") { "cable" } else { "wifi" });

    let resume_token = lock(&s.token).clone();
    let sent_secret = store::secret_for(&s.peer_id);
    write_msg(
        &mut control,
        &Msg::Offer {
            v: proto::PROTO_VERSION,
            from_id: store::my_id(),
            from_name: store::display_name(),
            from_model: store::model_name(),
            code: s.code.clone(),
            secret: sent_secret,
            resume_token: resume_token.clone(),
            manifest: s.manifest.clone(),
        },
    )
    .await?;
    if resume_token.is_none() {
        s.set_state(SendState::Waiting);
    }

    // the other side may sit on the dialog for a while; only our cancel interrupts that
    let reply = tokio::select! {
        _ = s.cancel.cancelled() => {
            let _ = write_msg(&mut control, &Msg::Cancel { reason: "cancelled".into() }).await;
            return Err(Stop::Fatal(SendState::Cancelled("Siz bekor qildingiz".into())));
        }
        r = read_msg(&mut control) => r?,
    };
    let (token, done) = match reply {
        Msg::Accept { token, secret, done } => {
            if let Some(sec) = secret {
                store::remember_secret(&s.peer_id, &sec);
            }
            (token, done)
        }
        Msg::Decline { reason } => return Err(Stop::Fatal(SendState::Declined(reason))),
        _ => return Err(Stop::Retry("unexpected reply".into())),
    };
    *lock(&s.token) = Some(token.clone());
    *last_ok = Instant::now();

    // the receiver's list is the truth: what it has is done, everything else goes (again)
    let queue: VecDeque<u32> = {
        let mut acked = lock(&s.acked);
        acked.iter_mut().for_each(|a| *a = false);
        let mut bytes = 0;
        for c in &done {
            if let Some(a) = acked.get_mut(*c as usize) {
                *a = true;
                bytes += s.chunks[*c as usize].len;
            }
        }
        s.acked_bytes.store(bytes, Ordering::Relaxed);
        (0..s.chunks.len() as u32).filter(|c| !acked[*c as usize]).collect()
    };
    s.counter.store(0, Ordering::Relaxed);
    s.set_state(if *s.paused.borrow() { SendState::Paused } else { SendState::Sending });

    let link = CancellationToken::new();
    let shared = Arc::new(Work { queue: Mutex::new(queue), progress: Notify::new() });
    let mut workers = tokio::task::JoinSet::new();
    let streams = if s.chunks.is_empty() { 0 } else { STREAMS };
    for _ in 0..streams {
        let (s2, w2, l2, t2) = (s.clone(), shared.clone(), link.clone(), token.clone());
        workers.spawn(async move {
            let r = worker(&s2, &w2, &l2, addr, &t2).await;
            if r.is_err() {
                l2.cancel();
            }
            r
        });
    }

    let result = control_loop(s, control, &shared, &link, last_ok).await;
    link.cancel();
    while let Some(r) = workers.join_next().await {
        if let Ok(Err(Stop::Fatal(st))) = r {
            return Err(Stop::Fatal(st));
        }
    }
    result
}

struct Work {
    queue: Mutex<VecDeque<u32>>,
    progress: Notify,
}

async fn control_loop(s: &Arc<Session>, control: TcpStream, work: &Work, link: &CancellationToken, last_ok: &mut Instant) -> Result<(), Stop> {
    let mut paused = s.paused.subscribe();
    let mut ping = tokio::time::interval(PING_EVERY);
    let mut last_reply = Instant::now();
    let mut finishing = false;
    let (mut rd, mut wr) = control.into_split();
    // read_msg is not cancel-safe, so it lives in its own task and hands over whole messages
    let (tx, mut replies) = tokio::sync::mpsc::channel::<std::io::Result<Msg>>(8);
    let reader = tokio::spawn(async move {
        loop {
            let m = read_msg(&mut rd).await;
            let failed = m.is_err();
            if tx.send(m).await.is_err() || failed {
                return;
            }
        }
    });
    let result = loop {
        if !finishing && s.all_acked() {
            finishing = true;
            if let Err(e) = write_msg(&mut wr, &Msg::Finish).await {
                break Err(e.into());
            }
        }
        tokio::select! {
            _ = s.cancel.cancelled() => {
                let _ = write_msg(&mut wr, &Msg::Cancel { reason: "cancelled".into() }).await;
                break Err(Stop::Fatal(SendState::Cancelled("Siz bekor qildingiz".into())));
            }
            // after Finish the receiver closes the data streams itself; wait for its Done instead
            _ = link.cancelled(), if !finishing => break Err(Stop::Retry("data stream dropped".into())),
            _ = paused.changed() => {
                let msg = if *paused.borrow_and_update() { Msg::Pause } else { Msg::Resume };
                if let Err(e) = write_msg(&mut wr, &msg).await {
                    break Err(e.into());
                }
            }
            _ = ping.tick() => {
                if last_reply.elapsed() > REPLY_TIMEOUT {
                    break Err(Stop::Retry("no reply".into()));
                }
                if let Err(e) = write_msg(&mut wr, &Msg::Ping).await {
                    break Err(e.into());
                }
            }
            _ = work.progress.notified() => { *last_ok = Instant::now(); }
            m = replies.recv() => {
                last_reply = Instant::now();
                *last_ok = Instant::now();
                let m = match m {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => break Err(e.into()),
                    None => break Err(Stop::Retry("control closed".into())),
                };
                match m {
                    Msg::Done => break Ok(()),
                    Msg::Missing { chunks } => {
                        // should not happen; resend what it lacks
                        let mut acked = lock(&s.acked);
                        let mut q = lock(&work.queue);
                        for c in chunks {
                            if let Some(a) = acked.get_mut(c as usize) {
                                if *a {
                                    *a = false;
                                    s.acked_bytes.fetch_sub(s.chunks[c as usize].len, Ordering::Relaxed);
                                }
                                q.push_back(c);
                            }
                        }
                        finishing = false;
                    }
                    Msg::Cancel { reason } => break Err(Stop::Fatal(SendState::Cancelled(reason))),
                    _ => {}
                }
            }
        }
    };
    reader.abort();
    result
}

/// Acks and Nacks coming back on a data stream
async fn ack_reader(mut rd: tokio::net::tcp::OwnedReadHalf, s: Arc<Session>, work: Arc<Work>, inflight: Arc<Mutex<HashSet<u32>>>) -> Result<(), Stop> {
    loop {
        match read_msg(&mut rd).await? {
            Msg::Ack { c } => {
                lock(&inflight).remove(&c);
                let mut acked = lock(&s.acked);
                if let Some(a) = acked.get_mut(c as usize) {
                    if !*a {
                        *a = true;
                        s.acked_bytes.fetch_add(s.chunks[c as usize].len, Ordering::Relaxed);
                    }
                }
                drop(acked);
                work.progress.notify_one();
            }
            Msg::Nack { c } => {
                lock(&inflight).remove(&c);
                lock(&work.queue).push_back(c);
            }
            _ => {}
        }
    }
}

/// One data stream: take a chunk, read it from disk, send it; acks come back on the same socket
async fn worker(s: &Arc<Session>, work: &Arc<Work>, link: &CancellationToken, addr: SocketAddr, token: &str) -> Result<(), Stop> {
    let stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(addr))
        .await
        .map_err(|_| Stop::Retry("data connect timeout".into()))??;
    let (rd, mut wr) = stream.into_split();
    write_msg(&mut wr, &Msg::Data { token: token.to_string() }).await?;

    // chunks sent on this stream but not acked yet go back to the queue if it dies
    let inflight = Arc::new(Mutex::new(HashSet::<u32>::new()));
    let requeue = |inflight: &Mutex<HashSet<u32>>| {
        let mut q = lock(&work.queue);
        for c in lock(inflight).drain() {
            q.push_front(c);
        }
    };

    let reader = ack_reader(rd, s.clone(), work.clone(), inflight.clone());

    // after the last chunk the stream stays open for acks until the control side ends the link
    let writer = async {
        send_chunks(s, work, &inflight, &mut wr).await?;
        link.cancelled().await;
        Ok::<(), Stop>(())
    };
    let result = tokio::select! {
        _ = link.cancelled() => Ok(()),
        r = reader => r,
        r = writer => r,
    };
    requeue(&inflight);
    result
}

/// Writer side of a data stream: returns once every chunk is acked (or paused forever)
async fn send_chunks(s: &Arc<Session>, work: &Work, inflight: &Mutex<HashSet<u32>>, wr: &mut tokio::net::tcp::OwnedWriteHalf) -> Result<(), Stop> {
    let mut paused = s.paused.subscribe();
    let mut buf = vec![0u8; proto::CHUNK_SIZE as usize];
    let mut open: Option<(usize, std::fs::File)> = None;
    loop {
        while *paused.borrow_and_update() {
            if paused.changed().await.is_err() {
                return Ok(());
            }
        }
        let next = lock(&work.queue).pop_front();
        let Some(c) = next else {
            if s.all_acked() {
                return Ok(());
            }
            // others still have chunks in flight; one may come back after a Nack
            tokio::time::sleep(Duration::from_millis(100)).await;
            continue;
        };
        let chunk = s.chunks[c as usize];
        lock(inflight).insert(c);
        s.current_file.store(chunk.file, Ordering::Relaxed);

        let file = match open.take() {
            Some((i, f)) if i == chunk.file => f,
            _ => std::fs::File::open(&s.sources[chunk.file]).map_err(|e| {
                Stop::Fatal(SendState::Failed(format!("{} ochilmadi: {e}", s.manifest.files[chunk.file].path)))
            })?,
        };
        let data = std::mem::take(&mut buf);
        let (res, file, data) = tokio::task::spawn_blocking(move || {
            let mut data = data;
            let r = file.read_exact_at(&mut data[..chunk.len as usize], chunk.offset);
            (r, file, data)
        })
        .await
        .map_err(|e| Stop::Retry(e.to_string()))?;
        buf = data;
        res.map_err(|e| {
            Stop::Fatal(SendState::Failed(format!("{} o'qilmadi (o'zgargan yoki o'chirilgan): {e}", s.manifest.files[chunk.file].path)))
        })?;
        open = Some((chunk.file, file));

        let body = &buf[..chunk.len as usize];
        write_msg(wr, &Msg::Chunk { c, crc: crc32fast::hash(body) }).await?;
        for piece in body.chunks(256 * 1024) {
            wr.write_all(piece).await?;
            s.counter.fetch_add(piece.len() as u64, Ordering::Relaxed);
        }
    }
}
