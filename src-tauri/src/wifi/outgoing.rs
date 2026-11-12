//! Mac -> iPhone: only files the user put on this list can be downloaded.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use super::lock;
use crate::device::importer::collect_files;

const MAX_FILES: usize = 5_000;
const IMAGE_EXT: [&str; 10] = ["jpg", "jpeg", "heic", "heif", "png", "gif", "webp", "tif", "tiff", "dng"];
const VIDEO_EXT: [&str; 6] = ["mov", "mp4", "m4v", "hevc", "avi", "mkv"];

#[derive(Clone)]
pub struct Entry {
    pub id: u32,
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    pub kind: &'static str,
    pub sent: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutgoingView {
    pub id: u32,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub kind: &'static str,
    pub sent_bytes: u64,
}

static FILES: Mutex<Vec<Entry>> = Mutex::new(Vec::new());
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

fn ext_of(name: &str) -> String {
    name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default()
}

pub fn kind_of(name: &str) -> &'static str {
    let ext = ext_of(name);
    if IMAGE_EXT.contains(&ext.as_str()) {
        "image"
    } else if VIDEO_EXT.contains(&ext.as_str()) {
        "video"
    } else {
        "file"
    }
}

/// Adds files (folders are opened, hidden files skipped), ignoring ones already listed
pub fn add(paths: &[String]) -> Vec<OutgoingView> {
    let found: Vec<(PathBuf, u64)> = paths.iter().flat_map(|p| collect_files(Path::new(p))).collect();
    {
        let mut files = lock(&FILES);
        for (path, size) in found {
            if files.len() >= MAX_FILES {
                break;
            }
            if files.iter().any(|f| f.path == path) {
                continue;
            }
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
            files.push(Entry { id, kind: kind_of(&name), name, path, size, sent: Arc::default() });
        }
    }
    list()
}

pub fn remove(id: u32) {
    lock(&FILES).retain(|f| f.id != id);
}

pub fn clear() {
    lock(&FILES).clear();
}

pub fn get(id: u32) -> Option<Entry> {
    lock(&FILES).iter().find(|f| f.id == id).cloned()
}

pub fn list() -> Vec<OutgoingView> {
    lock(&FILES)
        .iter()
        .map(|f| OutgoingView {
            id: f.id,
            name: f.name.clone(),
            path: f.path.to_string_lossy().into_owned(),
            size: f.size,
            kind: f.kind,
            sent_bytes: f.sent.load(Ordering::Relaxed),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds() {
        assert_eq!(kind_of("IMG_1.HEIC"), "image");
        assert_eq!(kind_of("clip.MOV"), "video");
        assert_eq!(kind_of("notes.pdf"), "file");
    }
}
