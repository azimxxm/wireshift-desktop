//! Mac -> iPhone bulk download: one stored (no compression) .zip built on the fly.
//! iOS browsers handle many parallel downloads badly; one file is easier to save.
//! Each file gets a CRC pre-pass so local headers carry real CRC + sizes (no data
//! descriptors): every unzip tool, including iOS Files, reads it. ZIP64 above 4 GB.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::body::Bytes;
use tokio::io::AsyncReadExt;
use tokio::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

use super::outgoing::ActiveGuard;
use super::state::{Shared, ZipJob, ZipState};

const U32_MAX: u64 = 0xFFFF_FFFF;
const LOCAL_LEN: u64 = 30;
const LOCAL_ZIP64_EXTRA: u64 = 20;
const CENTRAL_LEN: u64 = 46;
const CENTRAL_ZIP64_EXTRA: u64 = 28;
const END64_LEN: u64 = 56 + 20;
const END_LEN: u64 = 22;
/// bit 11: names are UTF-8
const FLAGS: u16 = 0x0800;
const READ_BUF: usize = 256 * 1024;

pub struct ZipItem {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    /// unix seconds
    pub modified: u64,
    pub sent: Arc<AtomicU64>,
    pub active: Arc<std::sync::atomic::AtomicU32>,
}

struct Written {
    name: String,
    size: u64,
    crc: u32,
    offset: u64,
    dos: (u16, u16),
}

fn needs_zip64(size: u64) -> bool {
    size >= U32_MAX
}

/// Exact archive size, known before streaming, so the phone sees real progress
pub fn total_len(items: &[ZipItem]) -> u64 {
    let (mut offset, mut central) = (0u64, 0u64);
    for it in items {
        let name = it.name.len() as u64;
        let big = needs_zip64(it.size);
        central += CENTRAL_LEN + name + if big || offset >= U32_MAX { CENTRAL_ZIP64_EXTRA } else { 0 };
        offset += LOCAL_LEN + name + if big { LOCAL_ZIP64_EXTRA } else { 0 } + it.size;
    }
    let end64 = items.len() as u64 >= 0xFFFF || central >= U32_MAX || offset >= U32_MAX;
    offset + central + if end64 { END64_LEN } else { 0 } + END_LEN
}

/// MS-DOS date/time (UTC) from unix seconds; zip can't store anything before 1980
fn dos_datetime(unix: u64) -> (u16, u16) {
    let days = (unix / 86_400) as i64;
    let secs = unix % 86_400;
    // days -> civil date (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    if !(1980..=2107).contains(&year) {
        return (0, (1 << 5) | 1);
    }
    let date = (((year - 1980) as u16) << 9) | ((month as u16) << 5) | day as u16;
    let time = (((secs / 3600) as u16) << 11) | ((((secs % 3600) / 60) as u16) << 5) | ((secs % 60) / 2) as u16;
    (time, date)
}

struct Buf(Vec<u8>);

impl Buf {
    fn u16(&mut self, v: u16) -> &mut Self {
        self.0.extend_from_slice(&v.to_le_bytes());
        self
    }
    fn u32(&mut self, v: u32) -> &mut Self {
        self.0.extend_from_slice(&v.to_le_bytes());
        self
    }
    fn u64(&mut self, v: u64) -> &mut Self {
        self.0.extend_from_slice(&v.to_le_bytes());
        self
    }
    fn bytes(&mut self, v: &[u8]) -> &mut Self {
        self.0.extend_from_slice(v);
        self
    }
}

fn local_header(name: &str, size: u64, crc: u32, dos: (u16, u16)) -> Vec<u8> {
    let big = needs_zip64(size);
    let small_size = if big { U32_MAX as u32 } else { size as u32 };
    let mut b = Buf(Vec::with_capacity(64 + name.len()));
    b.u32(0x0403_4b50).u16(if big { 45 } else { 20 }).u16(FLAGS).u16(0).u16(dos.0).u16(dos.1);
    b.u32(crc).u32(small_size).u32(small_size);
    b.u16(name.len() as u16).u16(if big { LOCAL_ZIP64_EXTRA as u16 } else { 0 }).bytes(name.as_bytes());
    if big {
        b.u16(0x0001).u16(16).u64(size).u64(size);
    }
    b.0
}

fn central_entry(b: &mut Buf, w: &Written) {
    let extra = needs_zip64(w.size) || w.offset >= U32_MAX;
    let size32 = if extra { U32_MAX as u32 } else { w.size as u32 };
    let offset32 = if w.offset >= U32_MAX { U32_MAX as u32 } else { w.offset as u32 };
    let version: u16 = if extra { 45 } else { 20 };
    b.u32(0x0201_4b50).u16(0x0300 | version).u16(version).u16(FLAGS).u16(0).u16(w.dos.0).u16(w.dos.1);
    b.u32(w.crc).u32(size32).u32(size32);
    b.u16(w.name.len() as u16).u16(if extra { CENTRAL_ZIP64_EXTRA as u16 } else { 0 }).u16(0);
    b.u16(0).u16(0).u32(0o100644 << 16).u32(offset32).bytes(w.name.as_bytes());
    if extra {
        b.u16(0x0001).u16(24).u64(w.size).u64(w.size).u64(w.offset);
    }
}

fn central_directory(entries: &[Written], start: u64) -> Vec<u8> {
    let mut b = Buf(Vec::new());
    for w in entries {
        central_entry(&mut b, w);
    }
    let size = b.0.len() as u64;
    let records = entries.len() as u64;
    let end = start + size;
    let zip64 = records >= 0xFFFF || size >= U32_MAX || start >= U32_MAX;
    if zip64 {
        b.u32(0x0606_4b50).u64(44).u16(0x0300 | 45).u16(45).u32(0).u32(0);
        b.u64(records).u64(records).u64(size).u64(start);
        b.u32(0x0706_4b50).u32(0).u64(end).u32(1);
    }
    let clamp16 = |v: u64| if zip64 { 0xFFFF } else { v as u16 };
    let clamp32 = |v: u64| if zip64 { U32_MAX as u32 } else { v as u32 };
    b.u32(0x0605_4b50).u16(0).u16(0).u16(clamp16(records)).u16(clamp16(records));
    b.u32(clamp32(size)).u32(clamp32(start)).u16(0);
    b.0
}

fn short_read(name: &str) -> std::io::Error {
    std::io::Error::other(format!("{name}: fayl yuborish paytida o'zgardi"))
}

async fn crc_of(it: &ZipItem) -> std::io::Result<u32> {
    let mut f = tokio::fs::File::open(&it.path).await?.take(it.size);
    let mut hasher = crc32fast::Hasher::new();
    let mut buf = vec![0u8; READ_BUF];
    let mut total = 0u64;
    loop {
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    if total != it.size {
        return Err(short_read(&it.name));
    }
    Ok(hasher.finalize())
}

/// Sends the file bytes; false when the phone went away or the server stopped
struct Ctx<'a> {
    tx: &'a Sender<std::io::Result<Bytes>>,
    shared: &'a Shared,
    job: &'a ZipJob,
    cancel: &'a CancellationToken,
}

async fn send_data(it: &ZipItem, c: &Ctx<'_>) -> std::io::Result<bool> {
    let mut f = tokio::fs::File::open(&it.path).await?.take(it.size);
    let mut total = 0u64;
    loop {
        if c.cancel.is_cancelled() {
            return Err(std::io::Error::other("wifi server stopped"));
        }
        let mut buf = vec![0u8; READ_BUF];
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        buf.truncate(n);
        total += n as u64;
        if c.tx.send(Ok(Bytes::from(buf))).await.is_err() {
            return Ok(false);
        }
        it.sent.fetch_add(n as u64, Ordering::Relaxed);
        c.job.sent.fetch_add(n as u64, Ordering::Relaxed);
        c.shared.add_sent(n as u64);
    }
    if total != it.size {
        return Err(short_read(&it.name));
    }
    Ok(true)
}

/// Ok(true) = whole archive sent, Ok(false) = the phone closed the download
async fn write_all(items: &[ZipItem], c: &Ctx<'_>) -> std::io::Result<bool> {
    let mut written = Vec::with_capacity(items.len());
    let mut offset = 0u64;
    for it in items {
        let crc = crc_of(it).await?;
        let dos = dos_datetime(it.modified);
        let header = local_header(&it.name, it.size, crc, dos);
        let header_len = header.len() as u64;
        c.job.sent.fetch_add(header_len, Ordering::Relaxed);
        if c.tx.send(Ok(Bytes::from(header))).await.is_err() || !send_data(it, c).await? {
            return Ok(false);
        }
        written.push(Written { name: it.name.clone(), size: it.size, crc, offset, dos });
        offset += header_len + it.size;
    }
    let tail = central_directory(&written, offset);
    c.job.sent.fetch_add(tail.len() as u64, Ordering::Relaxed);
    Ok(c.tx.send(Ok(Bytes::from(tail))).await.is_ok())
}

/// Streams the archive into `tx`; an error aborts the response so the phone sees a failed download
/// The Mac page shows the result: sent, or cancelled when the phone dropped it.
pub async fn stream(
    items: Vec<ZipItem>,
    tx: Sender<std::io::Result<Bytes>>,
    shared: Arc<Shared>,
    job: Arc<ZipJob>,
    cancel: CancellationToken,
) {
    let _active: Vec<ActiveGuard> = items.iter().map(|i| ActiveGuard::new(&i.active)).collect();
    let c = Ctx { tx: &tx, shared: &shared, job: &job, cancel: &cancel };
    let finished = match write_all(&items, &c).await {
        Ok(done) => done,
        Err(e) => {
            tracing::warn!(error = %e, "wifi: zip stream aborted");
            let _ = tx.send(Err(e)).await;
            false
        }
    };
    // the phone may still drop the last bytes in flight; "done" means everything was handed over
    *super::lock(&job.state) = if finished { ZipState::Done } else { ZipState::Cancelled };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(dir: &std::path::Path, name: &str, data: &[u8]) -> ZipItem {
        let path = dir.join(name);
        std::fs::write(&path, data).unwrap();
        ZipItem { name: name.into(), path, size: data.len() as u64, modified: 1_731_400_000, sent: Arc::default(), active: Arc::default() }
    }

    #[test]
    fn dos_dates() {
        // 2024-11-12 08:26:40 UTC
        let (time, date) = dos_datetime(1_731_400_000);
        assert_eq!((date >> 9) + 1980, 2024);
        assert_eq!((date >> 5) & 0xF, 11);
        assert_eq!(date & 0x1F, 12);
        assert_eq!((time >> 11, (time >> 5) & 0x3F), (8, 26));
        assert_eq!(dos_datetime(0), (0, (1 << 5) | 1));
    }

    #[test]
    fn zip64_sizes_are_counted() {
        let small = ZipItem { name: "a.mov".into(), path: PathBuf::new(), size: 10, modified: 0, sent: Arc::default(), active: Arc::default() };
        let big = ZipItem { name: "b.mov".into(), path: PathBuf::new(), size: 5 << 30, modified: 0, sent: Arc::default(), active: Arc::default() };
        assert_eq!(total_len(&[small]), 30 + 5 + 10 + 46 + 5 + 22);
        let expect = (30 + 5 + 20 + (5u64 << 30)) + (46 + 5 + 28) + END64_LEN + 22;
        assert_eq!(total_len(&[big]), expect);
    }

    #[test]
    fn archive_matches_length_and_unzips() {
        let dir = std::env::temp_dir().join(format!("ws-zip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let data: Vec<u8> = (0..700_000u32).map(|i| (i % 253) as u8).collect();
        let items = vec![item(&dir, "Sayr – Toshkent.heic", &data), item(&dir, "bo'sh.txt", b"")];
        let expected = total_len(&items);
        let shared = Arc::new(Shared::new(super::super::state::new_token().unwrap(), dir.join("unused")));
        let job = shared.add_zip("t.zip".into(), items.len(), expected);
        let probe = shared.clone();
        let bytes = tauri::async_runtime::block_on(async move {
            let (tx, mut rx) = tokio::sync::mpsc::channel(4);
            tokio::spawn(stream(items, tx, shared, job, CancellationToken::new()));
            let mut out = Vec::new();
            while let Some(chunk) = rx.recv().await {
                out.extend_from_slice(&chunk.unwrap());
            }
            out
        });
        assert_eq!(bytes.len() as u64, expected);
        let view = &probe.zips()[0];
        assert_eq!((view.state, view.sent), (ZipState::Done, expected));
        let zip = dir.join("out.zip");
        std::fs::write(&zip, &bytes).unwrap();
        let ok = std::process::Command::new("/usr/bin/unzip").arg("-tq").arg(&zip).status().unwrap();
        assert!(ok.success(), "unzip -t failed");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dropped_download_is_marked_cancelled() {
        let dir = std::env::temp_dir().join(format!("ws-zip-drop-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let items = vec![item(&dir, "a.bin", &vec![7u8; 3 * READ_BUF])];
        let active = items[0].active.clone();
        let shared = Arc::new(Shared::new(super::super::state::new_token().unwrap(), dir.join("unused")));
        let job = shared.add_zip("t.zip".into(), 1, total_len(&items));
        let probe = shared.clone();
        tauri::async_runtime::block_on(async move {
            let (tx, mut rx) = tokio::sync::mpsc::channel(1);
            let task = tokio::spawn(stream(items, tx, shared, job, CancellationToken::new()));
            let _ = rx.recv().await; // phone reads the header, then closes the download
            drop(rx);
            task.await.unwrap();
        });
        assert_eq!(probe.zips()[0].state, ZipState::Cancelled);
        assert_eq!(active.load(Ordering::Relaxed), 0, "download no longer counted as running");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
