//! iPhone -> Mac: a file arrives in 8 MB chunks (several at once, any order),
//! each written at its own offset into a hidden temp file, then renamed into place.

use std::fs::File;
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use super::state::{IncomingView, Shared};
use super::{lock, names};

pub const CHUNK_SIZE: u64 = 8 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024 * 1024;
const MAX_OPEN_UPLOADS: usize = 64;
const MAX_UPLOADS: usize = 20_000;

/// Error for the phone: HTTP status + Uzbek text shown on the page
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);

impl ApiError {
    pub fn new(code: StatusCode, msg: &str) -> Self {
        Self(code, msg.to_string())
    }
    pub fn disk(e: std::io::Error) -> Self {
        tracing::error!(error = %e, "wifi: disk write failed");
        Self(StatusCode::INSUFFICIENT_STORAGE, format!("Mac'ga yozib bo'lmadi: {e}"))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, axum::Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

#[derive(Debug, Deserialize)]
pub struct InitReq {
    pub name: String,
    pub size: u64,
    /// File.lastModified on the phone: same name+size+date = same file (resume)
    #[serde(default)]
    pub modified: u64,
}

#[derive(Debug, Serialize)]
pub struct InitResp {
    pub id: String,
    pub chunk_size: u64,
    /// chunk numbers the Mac still needs
    pub missing: Vec<u64>,
    /// already saved earlier in this session: nothing to send
    pub saved_as: Option<String>,
}

pub struct Upload {
    pub id: String,
    key: String,
    name: String,
    size: u64,
    tmp_path: PathBuf,
    file: File,
    got: Mutex<Vec<bool>>,
    received: AtomicU64,
    saved_as: Mutex<Option<String>>,
}

fn chunk_count(size: u64) -> u64 {
    size.div_ceil(CHUNK_SIZE)
}

/// Starts a new upload, or hands back the one with the same file key so the
/// phone only sends the chunks the Mac is still missing.
pub fn init(shared: &Shared, req: InitReq) -> Result<InitResp, ApiError> {
    if req.size > MAX_FILE_BYTES {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "Fayl juda katta (256 GB dan ortiq)"));
    }
    let name = names::sanitize_file_name(&req.name);
    let key = format!("{name}|{}|{}", req.size, req.modified);
    let mut uploads = lock(&shared.uploads);
    if let Some(up) = uploads.iter().find(|u| u.key == key) {
        return Ok(up.resume_info());
    }
    let open = uploads.iter().filter(|u| lock(&u.saved_as).is_none()).count();
    if open >= MAX_OPEN_UPLOADS || uploads.len() >= MAX_UPLOADS {
        return Err(ApiError::new(StatusCode::TOO_MANY_REQUESTS, "Bir vaqtda juda ko'p fayl: biroz kuting"));
    }
    std::fs::create_dir_all(&shared.dest_dir).map_err(ApiError::disk)?;
    let up = Arc::new(Upload::create(&shared.dest_dir, key, name, req.size)?);
    tracing::info!(name = %up.name, size = up.size, "wifi: upload started");
    let info = up.resume_info();
    uploads.push(up);
    Ok(info)
}

impl Upload {
    fn create(dir: &Path, key: String, name: String, size: u64) -> Result<Self, ApiError> {
        let id = super::state::new_token().map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?[..16].to_string();
        let tmp_path = dir.join(format!(".wifi-{id}.part"));
        let file = File::options().create_new(true).write(true).open(&tmp_path).map_err(ApiError::disk)?;
        Ok(Self {
            id,
            key,
            name,
            size,
            tmp_path,
            file,
            got: Mutex::new(vec![false; chunk_count(size) as usize]),
            received: AtomicU64::new(0),
            saved_as: Mutex::new(None),
        })
    }

    fn resume_info(&self) -> InitResp {
        let missing = lock(&self.got).iter().enumerate().filter(|(_, g)| !**g).map(|(i, _)| i as u64).collect();
        InitResp { id: self.id.clone(), chunk_size: CHUNK_SIZE, missing, saved_as: lock(&self.saved_as).clone() }
    }

    fn chunk_len(&self, index: u64) -> Result<u64, ApiError> {
        if index >= chunk_count(self.size) {
            return Err(ApiError::new(StatusCode::BAD_REQUEST, "Bo'lak raqami noto'g'ri"));
        }
        Ok(CHUNK_SIZE.min(self.size - index * CHUNK_SIZE))
    }

    /// Writes one chunk at its offset. Returns how many new bytes arrived (0 for a repeat).
    pub fn write_chunk(&self, index: u64, data: &[u8]) -> Result<u64, ApiError> {
        let expected = self.chunk_len(index)?;
        if data.len() as u64 != expected {
            return Err(ApiError::new(StatusCode::BAD_REQUEST, "Bo'lak hajmi noto'g'ri"));
        }
        if lock(&self.got)[index as usize] || lock(&self.saved_as).is_some() {
            return Ok(0);
        }
        self.file.write_all_at(data, index * CHUNK_SIZE).map_err(ApiError::disk)?;
        let mut got = lock(&self.got);
        if std::mem::replace(&mut got[index as usize], true) {
            return Ok(0);
        }
        self.received.fetch_add(expected, Ordering::Relaxed);
        Ok(expected)
    }

    /// All chunks here -> flush and move to a free name in `dir`. Safe to call twice.
    pub fn finish(&self, dir: &Path) -> Result<String, ApiError> {
        if let Some(saved) = lock(&self.saved_as).clone() {
            return Ok(saved);
        }
        if lock(&self.got).iter().any(|g| !g) {
            return Err(ApiError::new(StatusCode::CONFLICT, "Faylning hamma bo'laklari hali kelmagan"));
        }
        self.file.sync_all().map_err(ApiError::disk)?;
        let len = self.file.metadata().map_err(ApiError::disk)?.len();
        if len != self.size {
            return Err(ApiError::new(StatusCode::CONFLICT, "Fayl hajmi mos kelmadi, qayta yuboring"));
        }
        let target = names::unique_path(dir, &self.name);
        std::fs::rename(&self.tmp_path, &target).map_err(ApiError::disk)?;
        let saved = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        *lock(&self.saved_as) = Some(saved.clone());
        Ok(saved)
    }

    pub fn discard_if_unfinished(&self) {
        if lock(&self.saved_as).is_none() {
            let _ = std::fs::remove_file(&self.tmp_path);
        }
    }

    pub fn view(&self) -> IncomingView {
        IncomingView {
            id: self.id.clone(),
            name: self.name.clone(),
            size: self.size,
            received: self.received.load(Ordering::Relaxed),
            saved_as: lock(&self.saved_as).clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(tag: &str) -> Shared {
        let dir = std::env::temp_dir().join(format!("ws-upload-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        Shared::new(super::super::state::new_token().unwrap(), dir)
    }

    fn req(name: &str, size: u64) -> InitReq {
        InitReq { name: name.into(), size, modified: 42 }
    }

    #[test]
    fn chunks_in_any_order_then_resume_and_finish() {
        let s = session("order");
        let size = CHUNK_SIZE + 10;
        let data: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
        let first = init(&s, req("../clip.mov", size)).unwrap();
        assert_eq!(first.missing, vec![0, 1]);
        let up = s.find_upload(&first.id).unwrap();
        assert_eq!(up.write_chunk(1, &data[CHUNK_SIZE as usize..]).unwrap(), 10);
        // page reload: same file key -> same upload, only chunk 0 missing
        let again = init(&s, req("../clip.mov", size)).unwrap();
        assert_eq!((again.id.as_str(), again.missing.clone()), (first.id.as_str(), vec![0]));
        assert!(up.finish(&s.dest_dir).is_err());
        assert!(up.write_chunk(0, &data[..5]).is_err(), "short chunk must be refused");
        up.write_chunk(0, &data[..CHUNK_SIZE as usize]).unwrap();
        assert_eq!(up.finish(&s.dest_dir).unwrap(), "clip.mov");
        assert_eq!(std::fs::read(s.dest_dir.join("clip.mov")).unwrap(), data);
        // a second copy of another file with the same name never overwrites
        let other = init(&s, InitReq { modified: 7, ..req("clip.mov", 0) }).unwrap();
        assert_eq!(s.find_upload(&other.id).unwrap().finish(&s.dest_dir).unwrap(), "clip (2).mov");
        assert!(up.write_chunk(9, &[]).is_err());
        s.cleanup();
        std::fs::remove_dir_all(&s.dest_dir).unwrap();
    }

    #[test]
    fn huge_files_are_refused() {
        let s = session("huge");
        assert!(init(&s, req("x.mov", MAX_FILE_BYTES + 1)).is_err());
    }
}
