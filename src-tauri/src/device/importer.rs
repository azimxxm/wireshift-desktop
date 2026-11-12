//! Mac -> iPhone: copies Mac files into one folder inside an app's Documents
//! (Files > On My iPhone > App > folder). From there the user picks
//! "Save to Photos" on the phone. Nothing outside that folder is touched.

use crate::device::native::{self, DocumentsWriter};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Keep this much free on the phone so iOS doesn't start purging caches mid-copy
const FREE_SPACE_MARGIN: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportProgress {
    pub active: bool,
    pub total_files: usize,
    pub done_files: usize,
    pub total_bytes: u64,
    pub done_bytes: u64,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalItem {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub file_count: usize,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub copied: usize,
    pub folder: String,
}

static PROGRESS: Mutex<ImportProgress> = Mutex::new(ImportProgress {
    active: false,
    total_files: 0,
    done_files: 0,
    total_bytes: 0,
    done_bytes: 0,
    current_file: String::new(),
});
static CANCEL: AtomicBool = AtomicBool::new(false);

pub struct FileImporter;

impl FileImporter {
    pub fn progress() -> ImportProgress {
        PROGRESS.lock().map(|p| p.clone()).unwrap_or_default()
    }

    pub fn cancel() {
        CANCEL.store(true, Ordering::SeqCst);
    }

    /// Sizes and file counts of what the user picked/dropped (folders are walked).
    pub fn inspect_local(paths: &[String]) -> Vec<LocalItem> {
        paths
            .iter()
            .filter_map(|p| {
                let path = PathBuf::from(p);
                let meta = std::fs::metadata(&path).ok()?;
                let files = collect_files(&path);
                Some(LocalItem {
                    path: p.clone(),
                    name: path.file_name()?.to_string_lossy().into_owned(),
                    is_dir: meta.is_dir(),
                    file_count: files.len(),
                    size_bytes: files.iter().map(|(_, s)| s).sum(),
                })
            })
            .collect()
    }

    /// Blocking: run it on a blocking thread.
    pub fn import(udid: &str, bundle_id: &str, folder: &str, paths: &[String]) -> Result<ImportResult, String> {
        let folder = sanitize_folder(folder)?;
        let files: Vec<(PathBuf, u64)> = paths.iter().flat_map(|p| collect_files(Path::new(p))).collect();
        if files.is_empty() {
            return Err("Yuboriladigan fayl yo'q".into());
        }
        let total_bytes: u64 = files.iter().map(|(_, s)| s).sum();

        if let Ok((_, free)) = native::filesystem_info(udid) {
            if free < total_bytes + FREE_SPACE_MARGIN {
                return Err(format!(
                    "Telefonda joy yetmaydi: kerak {} MB, bo'sh {} MB",
                    total_bytes / 1_048_576,
                    free.saturating_sub(FREE_SPACE_MARGIN) / 1_048_576
                ));
            }
        }

        CANCEL.store(false, Ordering::SeqCst);
        set_progress(|p| {
            *p = ImportProgress { active: true, total_files: files.len(), total_bytes, ..Default::default() }
        });
        let result = copy_all(udid, bundle_id, &folder, &files);
        set_progress(|p| p.active = false);
        result
    }
}

fn copy_all(udid: &str, bundle_id: &str, folder: &str, files: &[(PathBuf, u64)]) -> Result<ImportResult, String> {
    let writer = DocumentsWriter::open(udid, bundle_id)?;
    let remote_dir = format!("/Documents/{}", folder);
    writer.make_dir(&remote_dir)?;

    let mut copied = 0;
    for (local, _) in files {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        let name = local.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let remote = unique_remote_path(&writer, &remote_dir, &name);
        set_progress(|p| p.current_file = name.clone());

        writer.write_file(local, &remote, |n| {
            set_progress(|p| p.done_bytes += n);
            !CANCEL.load(Ordering::SeqCst)
        })?;
        copied += 1;
        set_progress(|p| p.done_files = copied);
    }
    tracing::info!("imported {} files into {} ({})", copied, remote_dir, bundle_id);
    Ok(ImportResult { copied, folder: folder.to_string() })
}

fn set_progress(f: impl FnOnce(&mut ImportProgress)) {
    if let Ok(mut p) = PROGRESS.lock() {
        f(&mut p);
    }
}

/// "IMG_1.MOV" -> "IMG_1 (2).MOV" when two picked files share a name (never overwrite)
fn unique_remote_path(writer: &DocumentsWriter, dir: &str, name: &str) -> String {
    let first = format!("{}/{}", dir, name);
    if !writer.exists(&first) {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..10_000)
        .map(|n| format!("{}/{} ({}){}", dir, stem, n, ext))
        .find(|p| !writer.exists(p))
        .unwrap_or(first)
}

fn sanitize_folder(raw: &str) -> Result<String, String> {
    let name: String = raw
        .trim()
        .chars()
        .map(|c| if c == '/' || c == ':' || c.is_control() { '-' } else { c })
        .collect();
    let name = name.trim_start_matches('.').trim().to_string();
    if name.is_empty() {
        return Err("Papka nomi bo'sh".into());
    }
    Ok(name)
}

/// Regular files under `path` (or `path` itself), hidden files like .DS_Store skipped.
pub(crate) fn collect_files(path: &Path) -> Vec<(PathBuf, u64)> {
    let hidden = path.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false);
    if hidden {
        return Vec::new();
    }
    let Ok(meta) = std::fs::symlink_metadata(path) else { return Vec::new() };
    if meta.is_file() {
        return vec![(path.to_path_buf(), meta.len())];
    }
    if !meta.is_dir() {
        return Vec::new(); // symlinks and specials are skipped
    }
    let Ok(entries) = std::fs::read_dir(path) else { return Vec::new() };
    let mut children: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    children.sort();
    children.iter().flat_map(|c| collect_files(c)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_are_safe() {
        assert_eq!(sanitize_folder(" WireShift 12.11 ").unwrap(), "WireShift 12.11");
        assert_eq!(sanitize_folder("../a/b:c").unwrap(), "-a-b-c");
        assert!(sanitize_folder("  ...  ").is_err());
    }

    #[test]
    fn hidden_files_are_skipped() {
        let dir = std::env::temp_dir().join("ws_collect_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.mov"), b"12345").unwrap();
        std::fs::write(dir.join(".DS_Store"), b"x").unwrap();
        std::fs::write(dir.join("sub/b.jpg"), b"123").unwrap();
        let files = collect_files(&dir);
        assert_eq!(files.len(), 2);
        assert_eq!(files.iter().map(|(_, s)| s).sum::<u64>(), 8);
        let _ = std::fs::remove_dir_all(&dir);
    }

    // WS_UDID=... cargo test import_real -- --ignored --nocapture  (sends 2 files to VLC, then removes them)
    #[test]
    #[ignore]
    fn import_real_device() {
        let udid = std::env::var("WS_UDID").expect("WS_UDID");
        let dir = std::env::temp_dir().join("ws_import_real");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("clip.mov"), vec![1u8; 20 * 1024 * 1024]).unwrap();
        std::fs::write(dir.join("photo.jpg"), vec![2u8; 3 * 1024 * 1024]).unwrap();
        let t = std::time::Instant::now();
        let r = FileImporter::import(&udid, "org.videolan.vlc-ios", "WireShift test", &[dir.to_string_lossy().into_owned()])
            .expect("import");
        let secs = t.elapsed().as_secs_f64();
        println!("copied {} in {:.2}s = {:.1} MB/s, progress={:?}", r.copied, secs, 23.0 / secs, FileImporter::progress());
        let w = DocumentsWriter::open(&udid, "org.videolan.vlc-ios").unwrap();
        for f in ["clip.mov", "photo.jpg"] {
            w.remove(&format!("/Documents/WireShift test/{}", f));
        }
        w.remove("/Documents/WireShift test");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

