//! `wsmedia://localhost/<udid>/<percent-encoded device path>` — streams a file
//! straight from the iPhone with HTTP Range support, so <video> can start
//! playing and seek without downloading the whole file first. Read-only.

use crate::device::native;
use percent_encoding::percent_decode_str;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::http::{header, Request, Response, StatusCode};

/// Largest chunk we answer for one Range request (WebKit asks again for more).
const MAX_CHUNK: u64 = 4 * 1024 * 1024;
/// Photos are small enough to send in one response.
const MAX_WHOLE_FILE: u64 = 64 * 1024 * 1024;

static SIZE_CACHE: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_uppercase().as_str() {
        "MOV" => "video/quicktime",
        "MP4" | "M4V" => "video/mp4",
        "HEIC" | "HEIF" => "image/heic",
        "JPG" | "JPEG" => "image/jpeg",
        "PNG" => "image/png",
        "GIF" => "image/gif",
        "M4A" => "audio/mp4",
        "MP3" => "audio/mpeg",
        "WAV" => "audio/wav",
        _ => "application/octet-stream",
    }
}

fn cached_size(udid: &str, path: &str) -> Result<u64, String> {
    let key = format!("{}|{}", udid, path);
    if let Ok(guard) = SIZE_CACHE.lock() {
        if let Some(size) = guard.as_ref().and_then(|m| m.get(&key)) {
            return Ok(*size);
        }
    }
    let size = native::file_size(udid, path)?;
    if let Ok(mut guard) = SIZE_CACHE.lock() {
        guard.get_or_insert_with(HashMap::new).insert(key, size);
    }
    Ok(size)
}

/// Parses "bytes=start-end" / "bytes=start-" / "bytes=-suffix".
fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let suffix: u64 = b.parse().ok()?;
        (size.saturating_sub(suffix), size.saturating_sub(1))
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { size.saturating_sub(1) } else { b.parse::<u64>().ok()?.min(size.saturating_sub(1)) };
        (start, end)
    };
    if start > end || start >= size {
        return None;
    }
    Some((start, end))
}

fn error(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_default()
}

pub fn handle(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    // URI path: /<udid>/<percent-encoded device path>
    let raw = request.uri().path().trim_start_matches('/');
    let Some((udid, encoded_path)) = raw.split_once('/') else {
        return error(StatusCode::BAD_REQUEST, "bad media url");
    };
    let device_path = percent_decode_str(encoded_path).decode_utf8_lossy().to_string();
    // Only allow the media folders we list in the catalog
    if !(device_path.starts_with("/DCIM/") || device_path.starts_with("/Recordings/") || device_path.starts_with("/Downloads/"))
        || device_path.contains("..")
    {
        return error(StatusCode::FORBIDDEN, "path not allowed");
    }

    let size = match cached_size(udid, &device_path) {
        Ok(s) => s,
        Err(e) => return error(StatusCode::NOT_FOUND, &e),
    };
    let mime = mime_for(&device_path);
    let range_header = request.headers().get(header::RANGE).and_then(|v| v.to_str().ok());

    let (start, end, partial) = match range_header {
        Some(r) => match parse_range(r, size) {
            Some((s, e)) => (s, e.min(s + MAX_CHUNK - 1), true),
            None => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{}", size))
                    .body(Vec::new())
                    .unwrap_or_default()
            }
        },
        None if size <= MAX_WHOLE_FILE => (0, size.saturating_sub(1), false),
        // Big file without Range: answer with the first chunk as a partial response
        None => (0, MAX_CHUNK - 1, true),
    };

    let len = (end - start + 1) as u32;
    let data = match native::read_range(udid, &device_path, start, len) {
        Ok(d) => d,
        Err(e) => return error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    let actual_end = start + data.len().max(1) as u64 - 1;

    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, data.len().to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store");
    builder = if partial {
        builder
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {}-{}/{}", start, actual_end, size))
    } else {
        builder.status(StatusCode::OK)
    };
    builder.body(data).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=0-1", 100), Some((0, 1)));
        assert_eq!(parse_range("bytes=90-200", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=100-", 100), None);
    }
}
