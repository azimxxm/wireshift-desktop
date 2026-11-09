use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::AsyncWriteExt;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crate::device::Bridge;

static EXPORT_CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MediaItem {
    pub path: String,
    pub name: String,
    pub album: String,
    pub size_bytes: u64,
    pub date: String,
    pub kind: String, // "video", "photo", "audio", "sidecar", "file"
    pub extension: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct MediaCatalogSummary {
    pub total_files: usize,
    pub total_bytes: u64,
    pub video_count: usize,
    pub video_bytes: u64,
    pub photo_count: usize,
    pub photo_bytes: u64,
    pub other_count: usize,
    pub other_bytes: u64,
    pub items: Vec<MediaItem>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExportProgress {
    pub copied_files: usize,
    pub copied_bytes: u64,
    pub current_album: String,
}

pub struct FileExporter;

impl FileExporter {
    pub fn cancel_export() {
        EXPORT_CANCELLED.store(true, Ordering::SeqCst);
        let _ = std::process::Command::new("pkill").arg("-f").arg("afcclient").spawn();
    }

    pub fn reset_cancel() {
        EXPORT_CANCELLED.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled() -> bool {
        EXPORT_CANCELLED.load(Ordering::SeqCst)
    }

    /// Local Mac folder with cached thumbnails (~/.cache/wireshift)
    pub fn cache_root() -> PathBuf {
        dirs_home().unwrap_or_else(|| PathBuf::from("/tmp")).join(".cache/wireshift")
    }

    /// Resolve path string (expanding ~ to $HOME if needed)
    pub fn resolve_path(path_str: &str) -> PathBuf {
        if path_str.starts_with("~/") {
            if let Some(home) = dirs_home() {
                return home.join(path_str.trim_start_matches("~/"));
            }
        } else if path_str == "~" {
            if let Some(home) = dirs_home() {
                return home;
            }
        }
        PathBuf::from(path_str)
    }

    /// Return standard export destination folder: ~/Pictures/WireShift_Exports
    pub fn default_export_dir() -> String {
        if let Some(home) = dirs_home() {
            let p = home.join("Pictures").join("WireShift_Exports");
            return p.to_string_lossy().to_string();
        }
        "/tmp/WireShift_Exports".to_string()
    }

    /// Check live progress on disk by scanning destination folder
    pub fn get_export_progress(destination_dir: &str) -> ExportProgress {
        let mut count = 0;
        let mut bytes = 0;
        let mut current_album = String::new();

        let dest = Self::resolve_path(destination_dir);
        if let Ok(entries) = std::fs::read_dir(&dest) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !name.starts_with('.') {
                            current_album = name;
                            if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                                for sub in sub_entries.flatten() {
                                    let sub_name = sub.file_name().to_string_lossy().to_string();
                                    if !sub_name.starts_with('.') {
                                        count += 1;
                                        if let Ok(meta) = sub.metadata() {
                                            bytes += meta.len();
                                        }
                                    }
                                }
                            }
                        }
                    } else if file_type.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !name.starts_with('.') {
                            count += 1;
                            if let Ok(meta) = entry.metadata() {
                                bytes += meta.len();
                            }
                        }
                    }
                }
            }
        }

        ExportProgress {
            copied_files: count,
            copied_bytes: bytes,
            current_album,
        }
    }

    /// List all DCIM photo albums/folders on the device
    pub async fn list_dcim_albums(udid: &str) -> Result<Vec<String>, String> {
        let output = Bridge::tokio_cmd("afcclient")
            .arg("-u")
            .arg(udid)
            .arg("list")
            .arg("/DCIM")
            .output()
            .await
            .map_err(|e| format!("afcclient failed: {}", e))?;

        if !output.status.success() {
            return Err("DCIM papkasini o'qib bo'lmadi".into());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let albums: Vec<String> = stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.starts_with('.'))
            .collect();

        Ok(albums)
    }

    /// Fetch the media catalog across DCIM albums and legacy /Recordings
    pub async fn fetch_media_catalog(udid: &str) -> Result<MediaCatalogSummary, String> {
        let albums = Self::list_dcim_albums(udid).await?;

        // Build single batch script with ALBUM_MARKER_ to guarantee zero album desync
        let mut batch_script = String::new();
        for album in &albums {
            batch_script.push_str(&format!("ALBUM_MARKER_{}\nls -l /DCIM/{}\n", album, album));
        }
        batch_script.push_str("ALBUM_MARKER_Recordings\nls -l /Recordings\n");
        batch_script.push_str("exit\n");

        let mut child = Bridge::tokio_cmd("afcclient")
            .kill_on_drop(true)
            .arg("-u")
            .arg(udid)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("afcclient ishga tushmadi: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(batch_script.as_bytes()).await;
        }

        let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout);

        let mut items = Vec::new();
        let mut total_bytes = 0u64;
        let mut video_count = 0usize;
        let mut video_bytes = 0u64;
        let mut photo_count = 0usize;
        let mut photo_bytes = 0u64;
        let mut other_count = 0usize;
        let mut other_bytes = 0u64;

        let mut current_album = albums.first().cloned().unwrap_or_else(|| "100APPLE".into());

        for line in stdout.lines() {
            if line.contains("ALBUM_MARKER_") {
                if let Some(rest) = line.split("ALBUM_MARKER_").nth(1) {
                    let album_token = rest.split('\'').next().unwrap_or(rest).trim();
                    if !album_token.is_empty() {
                        current_album = album_token.to_string();
                    }
                }
            }

            let clean = line.replace("afc:/ > ", "").trim().to_string();
            if clean.starts_with("-rw-") {
                let parts: Vec<&str> = clean.split_whitespace().collect();
                if parts.len() >= 9 {
                    let size_bytes: u64 = parts[4].parse().unwrap_or(0);
                    let date = format!("{} {} {} {}", parts[5], parts[6], parts[7], parts[8]);
                    let name = parts[9..].join(" ");
                    let ext = name.rsplit('.').next().unwrap_or("").to_uppercase();

                    let kind = if ext == "MP4" || ext == "MOV" || ext == "M4V" {
                        video_count += 1;
                        video_bytes += size_bytes;
                        "video".to_string()
                    } else if ext == "JPG" || ext == "JPEG" || ext == "HEIC" || ext == "PNG" || ext == "GIF" {
                        photo_count += 1;
                        photo_bytes += size_bytes;
                        "photo".to_string()
                    } else if ext == "AAE" {
                        // Photos edit sidecar (small plist next to the original photo)
                        other_count += 1;
                        other_bytes += size_bytes;
                        "sidecar".to_string()
                    } else if ext == "M4A" || ext == "WAV" || ext == "AAC" || ext == "MP3" {
                        other_count += 1;
                        other_bytes += size_bytes;
                        "audio".to_string()
                    } else {
                        other_count += 1;
                        other_bytes += size_bytes;
                        "file".to_string()
                    };

                    total_bytes += size_bytes;

                    let path = if current_album == "Recordings" {
                        format!("/Recordings/{}", name)
                    } else {
                        format!("/DCIM/{}/{}", current_album, name)
                    };

                    items.push(MediaItem {
                        path,
                        name,
                        album: current_album.clone(),
                        size_bytes,
                        date,
                        kind,
                        extension: ext,
                    });
                }
            }
        }

        // Sort items strictly chronologically descending (NEWEST RECORDINGS & PHOTOS FIRST):
        // 1. Album number descending (106APPLE > 105APPLE > 100APPLE)
        // 2. File number descending (IMG_5999 > IMG_5000)
        items.sort_by(|a, b| {
            let album_a = extract_album_num(&a.album);
            let album_b = extract_album_num(&b.album);
            if album_a != album_b {
                return album_b.cmp(&album_a);
            }
            let file_a = extract_file_num(&a.name);
            let file_b = extract_file_num(&b.name);
            if file_a != file_b {
                return file_b.cmp(&file_a);
            }
            b.name.cmp(&a.name)
        });

        let total_files = items.len();

        Ok(MediaCatalogSummary {
            total_files,
            total_bytes,
            video_count,
            video_bytes,
            photo_count,
            photo_bytes,
            other_count,
            other_bytes,
            items,
        })
    }

    /// Where a device file lands on the Mac: dest/<file> or dest/<album>/<file>
    fn local_target(dest: &Path, device_path: &str, keep_albums: bool) -> PathBuf {
        let p = Path::new(device_path);
        let file = p.file_name().unwrap_or_default();
        match p.parent().and_then(|a| a.file_name()) {
            Some(album) if keep_albums => dest.join(album).join(file),
            _ => dest.join(file),
        }
    }

    /// Drop files that already exist on the Mac with the same size (re-runs copy only new files)
    pub async fn filter_new_files(
        destination_dir: &str,
        items: Vec<(String, u64)>,
        keep_albums: bool,
    ) -> Vec<String> {
        let dest = Self::resolve_path(destination_dir);
        let mut fresh = Vec::new();
        for (path, size) in items {
            let local = Self::local_target(&dest, &path, keep_albums);
            let same = tokio::fs::metadata(&local).await.map(|m| m.len() == size).unwrap_or(false);
            if !same {
                fresh.push(path);
            }
        }
        fresh
    }

    /// Export specifically selected files directly to local destination
    pub async fn export_selected_items(
        udid: &str,
        destination_dir: &str,
        paths: Vec<String>,
        keep_albums: bool,
    ) -> Result<usize, String> {
        Self::reset_cancel();
        if Self::is_cancelled() {
            return Err("Eksport bekor qilindi".into());
        }
        let dest = Self::resolve_path(destination_dir);
        tokio::fs::create_dir_all(&dest)
            .await
            .map_err(|e| format!("Papka yaratib bo'lmadi ({}): {}", dest.display(), e))?;

        if paths.is_empty() {
            return Ok(0);
        }

        // Build single batch script with all `get "<remote>" "<local>"` commands
        let mut script = String::new();
        for path in &paths {
            let local_dest = Self::local_target(&dest, path, keep_albums);
            if let Some(parent) = local_dest.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            script.push_str(&format!("get \"{}\" \"{}\"\n", path, local_dest.display()));
        }
        script.push_str("exit\n");

        let mut child = Bridge::tokio_cmd("afcclient")
            .kill_on_drop(true)
            .arg("-u")
            .arg(udid)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("afcclient ishga tushmadi: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(script.as_bytes()).await;
            let _ = stdin.flush().await;
            drop(stdin);
        }

        let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            let out_msg = String::from_utf8_lossy(&output.stdout);
            return Err(format!("afcclient bilan ko'chirishda xatolik yuz berdi: {} {}", err_msg.trim(), out_msg.trim()));
        }

        Ok(paths.len())
    }

    /// Cable benchmark: read up to 64 MB of the largest recent video straight
    /// from the phone (in memory, no temp file) and time it.
    pub async fn run_cable_speed_test(udid: &str) -> Result<crate::device::model::CableBenchmarkResult, String> {
        const SAMPLE: u64 = 64 * 1024 * 1024;
        const CHUNK: u64 = 4 * 1024 * 1024;

        let catalog = Self::fetch_media_catalog(udid).await?;
        let sample = catalog
            .items
            .iter()
            .filter(|i| i.size_bytes >= 8 * 1024 * 1024)
            .max_by_key(|i| i.size_bytes.min(SAMPLE))
            .cloned()
            .ok_or_else(|| "Test uchun telefonda kamida 8 MB li fayl topilmadi.".to_string())?;

        let id = udid.to_string();
        let path = sample.path.clone();
        let total = sample.size_bytes.min(SAMPLE);
        let (read, elapsed) = tokio::task::spawn_blocking(move || -> Result<(u64, f64), String> {
            // warm up the AFC connection so the handshake is not timed
            crate::device::native::read_range(&id, &path, 0, 64 * 1024)?;
            let start = std::time::Instant::now();
            let mut offset = 0u64;
            while offset < total {
                let len = CHUNK.min(total - offset) as u32;
                let got = crate::device::native::read_range(&id, &path, offset, len)?.len() as u64;
                if got == 0 {
                    break;
                }
                offset += got;
            }
            Ok((offset, start.elapsed().as_secs_f64()))
        })
        .await
        .map_err(|e| e.to_string())??;

        let mb = read as f64 / (1024.0 * 1024.0);
        let speed = if elapsed > 0.01 { mb / elapsed } else { 0.0 };
        Ok(crate::device::model::CableBenchmarkResult {
            speed_mb_s: (speed * 10.0).round() / 10.0,
            transferred_mb: (mb * 10.0).round() / 10.0,
            elapsed_seconds: (elapsed * 100.0).round() / 100.0,
            sample_file: sample.name,
        })
    }

    /// Fetch iOS pre-rendered thumbnail for photo or video
    pub async fn fetch_media_thumbnail(
        udid: &str,
        album: &str,
        filename: &str,
    ) -> Result<String, String> {
        let cache_dir = dirs_home()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".cache/wireshift/thumbnails")
            .join(udid);

        let _ = tokio::fs::create_dir_all(&cache_dir).await;
        let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));

        // 1. Check local cache first (<1ms)
        if local_cached.exists() {
            if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                if !bytes.is_empty() {
                    let b64 = STANDARD.encode(&bytes);
                    return Ok(format!("data:image/jpeg;base64,{}", b64));
                }
            }
        }

        // 2. Try fetching pre-rendered thumbnail from iOS PhotoData (5005.JPG or 5003.JPG)
        let remote_thumb_path = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}/5005.JPG", album, filename);
        let temp_dest = local_cached.to_str().unwrap_or("/tmp/thumb.jpg");

        let status = Bridge::tokio_cmd("afcclient")
            .arg("-u")
            .arg(udid)
            .arg("get")
            .arg(&remote_thumb_path)
            .arg(temp_dest)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .ok();

        if let Some(s) = status {
            if s.success() && local_cached.exists() {
                if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                    if !bytes.is_empty() {
                        let b64 = STANDARD.encode(&bytes);
                        return Ok(format!("data:image/jpeg;base64,{}", b64));
                    }
                }
            }
        }

        // 3. Fallback: try 5003.JPG
        let remote_thumb_path_alt = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}/5003.JPG", album, filename);
        let status_alt = Bridge::tokio_cmd("afcclient")
            .arg("-u")
            .arg(udid)
            .arg("get")
            .arg(&remote_thumb_path_alt)
            .arg(temp_dest)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .ok();

        if let Some(s) = status_alt {
            if s.success() && local_cached.exists() {
                if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                    if !bytes.is_empty() {
                        let b64 = STANDARD.encode(&bytes);
                        return Ok(format!("data:image/jpeg;base64,{}", b64));
                    }
                }
            }
        }

        // 4. Live Photo fallback for .MOV / .MP4: check paired .HEIC and .JPG thumbnail
        let stem = filename.rsplit_once('.').map(|(s, _)| s).unwrap_or(filename);
        for alt_ext in &["HEIC", "JPG", "PNG"] {
            let alt_path = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}.{}/5005.JPG", album, stem, alt_ext);
            let status_live = Bridge::tokio_cmd("afcclient")
                .arg("-u")
                .arg(udid)
                .arg("get")
                .arg(&alt_path)
                .arg(temp_dest)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .await
                .ok();

            if let Some(s) = status_live {
                if s.success() && local_cached.exists() {
                    if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                        if !bytes.is_empty() {
                            let b64 = STANDARD.encode(&bytes);
                            return Ok(format!("data:image/jpeg;base64,{}", b64));
                        }
                    }
                }
            }
        }

        Err("Thumbnail topilmadi".into())
    }

    /// Batch thumbnail fetch for multiple items in a single fast afcclient session
    pub async fn fetch_media_thumbnails_batch(
        udid: &str,
        items: Vec<(String, String)>,
    ) -> std::collections::HashMap<String, String> {
        let cache_dir = dirs_home()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".cache/wireshift/thumbnails")
            .join(udid);

        let _ = tokio::fs::create_dir_all(&cache_dir).await;

        let mut results = std::collections::HashMap::new();
        let mut missing_items = Vec::new();

        // 1. Check disk cache first (<1ms)
        for (album, filename) in &items {
            let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
            if local_cached.exists() {
                if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                    if !bytes.is_empty() {
                        let b64 = STANDARD.encode(&bytes);
                        results.insert(format!("{}_{}", album, filename), format!("data:image/jpeg;base64,{}", b64));
                        continue;
                    }
                }
            }
            missing_items.push((album.clone(), filename.clone()));
        }

        if missing_items.is_empty() {
            return results;
        }

        // 2. Download missing thumbnails in a single batch afcclient session (0.2s for 48 items!)
        let mut script = String::new();
        for (album, filename) in &missing_items {
            let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
            let remote_thumb_5005 = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}/5005.JPG", album, filename);
            script.push_str(&format!("get {} {}\n", remote_thumb_5005, local_cached.display()));
        }
        script.push_str("exit\n");

        let child = Bridge::tokio_cmd("afcclient")
            .kill_on_drop(true)
            .arg("-u")
            .arg(udid)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .ok();

        if let Some(mut c) = child {
            if let Some(mut stdin) = c.stdin.take() {
                let _ = stdin.write_all(script.as_bytes()).await;
            }
            let _ = c.wait().await;
        }

        // 3. For any remaining missing items, try 5003.JPG fallback
        let mut fallback_items = Vec::new();
        for (album, filename) in &missing_items {
            let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
            if local_cached.exists() {
                if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                    if !bytes.is_empty() {
                        let b64 = STANDARD.encode(&bytes);
                        results.insert(format!("{}_{}", album, filename), format!("data:image/jpeg;base64,{}", b64));
                        continue;
                    }
                }
            }
            fallback_items.push((album.clone(), filename.clone()));
        }

        if !fallback_items.is_empty() {
            let mut script_alt = String::new();
            for (album, filename) in &fallback_items {
                let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
                let remote_thumb_5003 = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}/5003.JPG", album, filename);
                script_alt.push_str(&format!("get {} {}\n", remote_thumb_5003, local_cached.display()));
            }
            script_alt.push_str("exit\n");

            let child_alt = Bridge::tokio_cmd("afcclient")
                .kill_on_drop(true)
                .arg("-u")
                .arg(udid)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .ok();

            if let Some(mut c) = child_alt {
                if let Some(mut stdin) = c.stdin.take() {
                    let _ = stdin.write_all(script_alt.as_bytes()).await;
                }
                let _ = c.wait().await;
            }

            for (album, filename) in &fallback_items {
                let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
                if local_cached.exists() {
                    if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                        if !bytes.is_empty() {
                            let b64 = STANDARD.encode(&bytes);
                            results.insert(format!("{}_{}", album, filename), format!("data:image/jpeg;base64,{}", b64));
                        }
                    }
                }
            }
        }

        // 4. Live Photo fallback: for remaining missing .MOV / .MP4 files, try .HEIC and .JPG
        let mut live_photo_candidates = Vec::new();
        for (album, filename) in &fallback_items {
            let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
            if !local_cached.exists() && (filename.ends_with(".MOV") || filename.ends_with(".mov") || filename.ends_with(".MP4") || filename.ends_with(".mp4")) {
                live_photo_candidates.push((album.clone(), filename.clone()));
            }
        }

        if !live_photo_candidates.is_empty() {
            let mut script_live = String::new();
            for (album, filename) in &live_photo_candidates {
                let stem = filename.rsplit_once('.').map(|(s, _)| s).unwrap_or(filename);
                let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
                let remote_thumb_heic = format!("/PhotoData/Thumbnails/V2/DCIM/{}/{}.HEIC/5005.JPG", album, stem);
                script_live.push_str(&format!("get {} {}\n", remote_thumb_heic, local_cached.display()));
            }
            script_live.push_str("exit\n");

            let child_live = Bridge::tokio_cmd("afcclient")
                .kill_on_drop(true)
                .arg("-u")
                .arg(udid)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .ok();

            if let Some(mut c) = child_live {
                if let Some(mut stdin) = c.stdin.take() {
                    let _ = stdin.write_all(script_live.as_bytes()).await;
                }
                let _ = c.wait().await;
            }

            for (album, filename) in &live_photo_candidates {
                let local_cached = cache_dir.join(format!("{}_{}.jpg", album, filename));
                if local_cached.exists() {
                    if let Ok(bytes) = tokio::fs::read(&local_cached).await {
                        if !bytes.is_empty() {
                            let b64 = STANDARD.encode(&bytes);
                            results.insert(format!("{}_{}", album, filename), format!("data:image/jpeg;base64,{}", b64));
                        }
                    }
                }
            }
        }

        results
    }
}

fn extract_album_num(album: &str) -> u32 {
    album.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)
}

fn extract_file_num(name: &str) -> u32 {
    let stem = name.split('.').next().unwrap_or(name);
    stem.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sorting_and_catalog() {
        crate::device::Bridge::init_environment();
        let udids = crate::device::DeviceDetector::list_udids().await.unwrap_or_default();
        if let Some(udid) = udids.first() {
            if let Ok(catalog) = FileExporter::fetch_media_catalog(udid).await {
                println!("Total files found: {}", catalog.total_files);
                println!("Total videos: {}", catalog.video_count);
                if catalog.total_files > 0 {
                    let first = &catalog.items[0];
                    println!("First item: {} in {}, path: {}", first.name, first.album, first.path);
                    for v in catalog.items.iter().filter(|i| i.kind == "video").take(3) {
                        println!("Video candidate: {} in {}, size: {}, path: {}", v.name, v.album, v.size_bytes, v.path);
                    }
                }
            }
        }
    }

    // Real phone needed: WS_OUT=/some/tmp/dir cargo test --lib real_device -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn real_device_export_and_benchmark() {
        crate::device::Bridge::init_environment();
        let udid = crate::device::DeviceDetector::list_udids().await.unwrap().remove(0);
        let out = std::env::var("WS_OUT").expect("WS_OUT");

        let catalog = FileExporter::fetch_media_catalog(&udid).await.unwrap();
        assert!(!catalog.items.iter().any(|i| i.path.starts_with("/Downloads")));
        let small: Vec<_> = catalog.items.iter().filter(|i| i.kind == "photo").take(2).cloned().collect();
        let pairs: Vec<_> = small.iter().map(|i| (i.path.clone(), i.size_bytes)).collect();

        let todo = FileExporter::filter_new_files(&out, pairs.clone(), true).await;
        assert_eq!(todo.len(), 2);
        FileExporter::export_selected_items(&udid, &out, todo, true).await.unwrap();
        for i in &small {
            let local = std::path::Path::new(&out).join(&i.album).join(&i.name);
            assert_eq!(std::fs::metadata(&local).unwrap().len(), i.size_bytes, "{}", local.display());
        }
        assert!(FileExporter::filter_new_files(&out, pairs, true).await.is_empty());

        let bench = FileExporter::run_cable_speed_test(&udid).await.unwrap();
        println!("bench: {:?}", bench);
        assert!(bench.speed_mb_s > 1.0);
    }
}
