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

    /// Count total photos and videos inside DCIM
    pub async fn count_dcim_files(udid: &str) -> Result<usize, String> {
        let albums = Self::list_dcim_albums(udid).await?;
        let mut total = 0;
        for album in albums {
            let path = format!("/DCIM/{}", album);
            if let Ok(out) = Bridge::tokio_cmd("afcclient")
                .arg("-u")
                .arg(udid)
                .arg("list")
                .arg(&path)
                .output()
                .await
            {
                let count = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .count();
                total += count;
            }
        }
        Ok(total)
    }

    /// Fetch full interactive media catalog across DCIM, Recordings, and Downloads
    pub async fn fetch_media_catalog(udid: &str) -> Result<MediaCatalogSummary, String> {
        let albums = Self::list_dcim_albums(udid).await?;

        // Build single batch script with ALBUM_MARKER_ to guarantee zero album desync
        let mut batch_script = String::new();
        for album in &albums {
            batch_script.push_str(&format!("ALBUM_MARKER_{}\nls -l /DCIM/{}\n", album, album));
        }
        batch_script.push_str("ALBUM_MARKER_Recordings\nls -l /Recordings\n");
        batch_script.push_str("ALBUM_MARKER_Downloads\nls -l /Downloads\n");
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
                    } else if current_album == "Downloads" {
                        format!("/Downloads/{}", name)
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

    /// Export specifically selected files directly to local destination
    pub async fn export_selected_items(
        udid: &str,
        destination_dir: &str,
        paths: Vec<String>,
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
            let filename = Path::new(path).file_name().unwrap_or_default().to_string_lossy();
            let local_dest = dest.join(filename.as_ref());
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

    /// Export DCIM camera roll to a local directory on Mac/PC
    pub async fn export_dcim_to_folder(udid: &str, destination_dir: &str) -> Result<usize, String> {
        Self::reset_cancel();
        let dest = Self::resolve_path(destination_dir);
        tokio::fs::create_dir_all(&dest)
            .await
            .map_err(|e| format!("Papka yaratib bo'lmadi ({}): {}", dest.display(), e))?;

        let albums = Self::list_dcim_albums(udid).await?;
        let mut copied_albums = 0;

        for album in albums {
            if Self::is_cancelled() {
                return Err("Eksport bekor qilindi".into());
            }

            let remote_path = format!("/DCIM/{}", album);
            let local_album_path = dest.join(&album);
            let _ = tokio::fs::create_dir_all(&local_album_path).await;

            let script = format!("get -rf \"{}\" \"{}\"\nexit\n", remote_path, dest.display());

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
            if output.status.success() {
                copied_albums += 1;
            }
        }

        Ok(copied_albums)
    }

    /// Real-world benchmark: download a small candidate file into a temp file and compute MB/s
    pub async fn run_cable_speed_test(udid: &str) -> Result<crate::device::model::CableBenchmarkResult, String> {
        let albums = Self::list_dcim_albums(udid).await?;
        let mut candidate_file: Option<String> = None;

        for album in albums {
            let out = Bridge::tokio_cmd("afcclient")
                .arg("-u")
                .arg(udid)
                .arg("ls")
                .arg(format!("DCIM/{}", album))
                .output()
                .await
                .ok();

            if let Some(o) = out {
                let text = String::from_utf8_lossy(&o.stdout);
                for line in text.lines() {
                    let file = line.trim();
                    if file.ends_with(".MOV") || file.ends_with(".MP4") || file.ends_with(".HEIC") {
                        candidate_file = Some(format!("DCIM/{}/{}", album, file));
                        break;
                    }
                }
            }
            if candidate_file.is_some() {
                break;
            }
        }

        let remote_path = candidate_file.ok_or_else(|| "Test qilish uchun telefondan birorta media fayl topilmadi.".to_string())?;

        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("wireshift_cable_test.bin");

        let start = std::time::Instant::now();
        let status = Bridge::tokio_cmd("afcclient")
            .arg("-u")
            .arg(udid)
            .arg("get")
            .arg(&remote_path)
            .arg(temp_file.to_str().unwrap_or("/tmp/wireshift_cable_test.bin"))
            .status()
            .await
            .map_err(|e| format!("Speed test xatoligi: {}", e))?;

        let elapsed = start.elapsed().as_secs_f64();

        if !status.success() {
            let _ = tokio::fs::remove_file(&temp_file).await;
            return Err("Kabel orqali faylni o'qishda xatolik yuz berdi.".into());
        }

        let file_size_bytes = tokio::fs::metadata(&temp_file)
            .await
            .map(|m| m.len())
            .unwrap_or(0);

        let _ = tokio::fs::remove_file(&temp_file).await;

        let transferred_mb = file_size_bytes as f64 / (1024.0 * 1024.0);
        let speed_mb_s = if elapsed > 0.05 { transferred_mb / elapsed } else { 0.0 };

        let (cable_grade, verdict) = if speed_mb_s < 45.0 {
            (
                "USB 2.0 (480 Mbps — Zaryad kabeli)".to_string(),
                "Haqiqiy tezlik ~30-35 MB/s. Bu kabel faqat USB 2.0 liniyalariga ega (Apple in-box oq kabeli). 10 Gbps kabel ulasangiz, 300+ MB/s ga chiqadi.".to_string(),
            )
        } else if speed_mb_s < 120.0 {
            (
                "USB 3.0 / 3.1 Gen 1 (5 Gbps)".to_string(),
                "Yaxshi tezlik! Kabel 5 Gbps tezlikda ishlamoqda.".to_string(),
            )
        } else {
            (
                "USB 3.2 Gen 2 / Thunderbolt 4 (10-40 Gbps)".to_string(),
                "Maksimal tezlik! Kabel 10 Gbps to'liq o'tkazuvchanlikka ega. Og'ir 4K/ProRes videolarni eng yuqori tezlikda o'tkazish uchun ideal!".to_string(),
            )
        };

        Ok(crate::device::model::CableBenchmarkResult {
            speed_mb_s: (speed_mb_s * 10.0).round() / 10.0,
            transferred_mb: (transferred_mb * 10.0).round() / 10.0,
            elapsed_seconds: (elapsed * 100.0).round() / 100.0,
            cable_grade,
            verdict,
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

    #[tokio::test]
    async fn test_export_video() {
        crate::device::Bridge::init_environment();
        let udids = crate::device::DeviceDetector::list_udids().await.unwrap_or_default();
        if let Some(udid) = udids.first() {
            let res = FileExporter::export_selected_items(
                udid,
                "~/Pictures/WireShift_Exports",
                vec!["/DCIM/104APPLE/IMG_4201.MOV".to_string()],
            ).await;
            println!("Export with tilde result: {:?}", res);
            assert!(res.is_ok());
        }
    }
}
