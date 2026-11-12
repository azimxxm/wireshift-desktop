//! The LAN HTTP server the phone talks to. Every route needs the session key
//! (`?k=` or `X-WS-Token`) and a peer address from a private range.

use std::collections::HashSet;
use std::io::SeekFrom;
use std::net::SocketAddr;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use axum::body::{Body, Bytes};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;
use tokio_stream::StreamExt;
use tokio_util::io::ReaderStream;
use tokio_util::sync::CancellationToken;

use super::outgoing::{self, ActiveGuard, Entry};
use super::range::{self, ByteRange};
use super::state::{self, Shared};
use super::upload::{self, ApiError, CancelBy, InitReq, InitResp, CHUNK_SIZE};
use super::zip::{self, ZipItem};
use super::{lock, names, net};

const PAGE: &str = include_str!("page.html");
const PAGE_CSP: &str = "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; \
     style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'";
const TOKEN_HEADER: &str = "x-ws-token";
/// The phone page uploads this many chunks at once
const PARALLEL_CHUNKS: u32 = 4;
const READ_BUF: usize = 256 * 1024;
const MAX_ZIP_FILES: usize = 5_000;

#[derive(Clone)]
struct Ctx {
    shared: Arc<Shared>,
    cancel: CancellationToken,
}

pub async fn run(listener: TcpListener, shared: Arc<Shared>, cancel: CancellationToken) {
    let app = router(Ctx { shared: shared.clone(), cancel: cancel.clone() });
    let serve = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(cancel.clone().cancelled_owned());
    if let Err(e) = serve.await {
        tracing::error!(error = %e, "wifi server failed");
    }
    let _ = tokio::task::spawn_blocking(move || shared.cleanup()).await;
}

fn router(ctx: Ctx) -> Router {
    let chunk_limit = DefaultBodyLimit::max(CHUNK_SIZE as usize + 64 * 1024);
    Router::new()
        .route("/", get(page))
        .route("/api/state", get(api_state))
        .route("/api/upload", post(upload_init))
        .route("/api/upload/{id}", axum::routing::delete(upload_cancel))
        .route("/api/chunk/{id}/{index}", put(upload_chunk).layer(chunk_limit))
        .route("/api/finish/{id}", post(upload_finish))
        .route("/api/file/{id}", get(download))
        .route("/api/zip", get(download_zip))
        .route("/api/thumb/{id}", get(thumb))
        .layer(middleware::from_fn_with_state(ctx.clone(), guard))
        .with_state(ctx)
}

fn request_token(req: &Request) -> Option<String> {
    if let Some(v) = req.headers().get(TOKEN_HEADER).and_then(|v| v.to_str().ok()) {
        return Some(v.to_string());
    }
    req.uri().query()?.split('&').find_map(|p| p.strip_prefix("k=")).map(str::to_string)
}

/// LAN-only + session key on every request; also marks the phone as seen
async fn guard(
    State(ctx): State<Ctx>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    if !net::is_allowed_peer(peer.ip()) {
        tracing::warn!(%peer, "wifi: refused a peer outside the local network");
        return ApiError::new(StatusCode::FORBIDDEN, "Faqat lokal tarmoqdan ulanish mumkin").into_response();
    }
    match request_token(&req) {
        None => {
            return ApiError::new(StatusCode::UNAUTHORIZED, "Kalit yo'q: Mac'dagi QR kodni skanerlang")
                .into_response()
        }
        Some(t) if !state::token_eq(&t, &ctx.shared.token) => {
            tracing::warn!(%peer, "wifi: wrong session key");
            return ApiError::new(
                StatusCode::FORBIDDEN,
                "Kalit noto'g'ri yoki eskirgan: Mac'dagi yangi QR kodni skanerlang",
            )
            .into_response();
        }
        Some(_) => {}
    }
    let ua = req.headers().get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
    ctx.shared.touch(peer.ip(), ua);
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    resp
}

async fn page() -> Response {
    ([(header::CONTENT_SECURITY_POLICY, PAGE_CSP)], Html(PAGE)).into_response()
}

async fn api_state(State(ctx): State<Ctx>) -> Json<Value> {
    // names and sizes only: Mac paths never leave the Mac
    let files: Vec<Value> = outgoing::list()
        .into_iter()
        .map(|f| json!({ "id": f.id, "name": f.name, "size": f.size, "kind": f.kind }))
        .collect();
    // uploads the Mac stopped: the phone aborts their chunks right away
    let cancelled = ctx.shared.cancelled_by_mac();
    Json(json!({ "files": files, "chunk_size": CHUNK_SIZE, "parallel": PARALLEL_CHUNKS, "cancelled": cancelled }))
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, ApiError> + Send + 'static,
) -> Result<T, ApiError> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Ichki xatolik"))?
}

fn stopped() -> ApiError {
    ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "Mac'da ulanish to'xtatilgan")
}

fn unknown_upload() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "Bu yuborish Mac'da topilmadi: faylni qayta tanlang")
}

async fn upload_init(State(ctx): State<Ctx>, Json(req): Json<InitReq>) -> Result<Json<InitResp>, ApiError> {
    if ctx.cancel.is_cancelled() {
        return Err(stopped());
    }
    let shared = ctx.shared.clone();
    blocking(move || upload::init(&shared, req)).await.map(Json)
}

async fn upload_chunk(
    State(ctx): State<Ctx>,
    Path((id, index)): Path<(String, u64)>,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    if ctx.cancel.is_cancelled() {
        return Err(stopped());
    }
    let up = ctx.shared.find_upload(&id).ok_or_else(unknown_upload)?;
    let shared = ctx.shared.clone();
    blocking(move || {
        let fresh = up.write_chunk(index, &body)?;
        shared.add_received(fresh);
        Ok(())
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn upload_finish(State(ctx): State<Ctx>, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    let up = ctx.shared.find_upload(&id).ok_or_else(unknown_upload)?;
    let shared = ctx.shared.clone();
    let saved = blocking(move || {
        let _one_at_a_time = lock(&shared.finish_lock);
        up.finish(&shared.dest_dir)
    })
    .await?;
    tracing::info!(file = %saved, "wifi: file received");
    Ok(Json(json!({ "saved_as": saved })))
}

/// The phone's "Bekor qilish": temp file is deleted at once, finished files stay
async fn upload_cancel(State(ctx): State<Ctx>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    let up = ctx.shared.find_upload(&id).ok_or_else(unknown_upload)?;
    blocking(move || up.cancel(CancelBy::Phone)).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct FileQuery {
    inline: Option<u8>,
}

fn mime_for(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "heic" | "heif" => "image/heic",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mov" => "video/quicktime",
        "mp4" | "m4v" => "video/mp4",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

/// `attachment` makes Safari save to Files → Downloads; `inline` opens the photo/video
fn content_disposition(name: &str, inline: bool) -> String {
    let ascii: String = name
        .chars()
        .map(|c| if (c.is_ascii_graphic() || c == ' ') && c != '"' && c != '\\' { c } else { '_' })
        .collect();
    let kind = if inline { "inline" } else { "attachment" };
    format!("{kind}; filename=\"{ascii}\"; filename*=UTF-8''{}", utf8_percent_encode(name, NON_ALPHANUMERIC))
}

/// Streams `len` bytes from `start`, counting what leaves the Mac; cut off on stop
async fn file_body(mut file: tokio::fs::File, start: u64, len: u64, entry: &Entry, ctx: &Ctx) -> std::io::Result<Body> {
    if start > 0 {
        file.seek(SeekFrom::Start(start)).await?;
    }
    let (sent, shared, cancel) = (entry.sent.clone(), ctx.shared.clone(), ctx.cancel.clone());
    // lives as long as the response body: browser X or lost Wi-Fi drops it
    let active = ActiveGuard::new(&entry.active);
    let stream = ReaderStream::with_capacity(file.take(len), READ_BUF).map(move |chunk| {
        let _running = &active;
        if cancel.is_cancelled() {
            return Err(std::io::Error::other("wifi server stopped"));
        }
        if let Ok(bytes) = &chunk {
            sent.fetch_add(bytes.len() as u64, Ordering::Relaxed);
            shared.add_sent(bytes.len() as u64);
        }
        chunk
    });
    Ok(Body::from_stream(stream))
}

fn not_found(msg: &str) -> Response {
    ApiError::new(StatusCode::NOT_FOUND, msg).into_response()
}

async fn download(
    State(ctx): State<Ctx>,
    Path(id): Path<u32>,
    Query(q): Query<FileQuery>,
    headers: HeaderMap,
) -> Response {
    let Some(entry) = outgoing::get(id) else { return not_found("Fayl yuborish ro'yxatida yo'q") };
    let Ok(file) = tokio::fs::File::open(&entry.path).await else { return not_found("Fayl Mac'da topilmadi") };
    let Ok(total) = file.metadata().await.map(|m| m.len()) else { return not_found("Fayl Mac'da topilmadi") };
    let (status, start, len) = match range::parse(headers.get(header::RANGE), total) {
        ByteRange::Full => (StatusCode::OK, 0, total),
        ByteRange::Partial { start, end } => (StatusCode::PARTIAL_CONTENT, start, end - start + 1),
        ByteRange::Unsatisfiable => {
            return (StatusCode::RANGE_NOT_SATISFIABLE, [(header::CONTENT_RANGE, format!("bytes */{total}"))])
                .into_response()
        }
    };
    let body = match file_body(file, start, len, &entry, &ctx).await {
        Ok(b) => b,
        Err(e) => return ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response(),
    };
    let mut resp = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_for(&entry.name))
        .header(header::CONTENT_LENGTH, len)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_DISPOSITION, content_disposition(&entry.name, q.inline.is_some()));
    if status == StatusCode::PARTIAL_CONTENT {
        resp = resp.header(header::CONTENT_RANGE, format!("bytes {start}-{}/{total}", start + len - 1));
    }
    resp.body(body).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

#[derive(Deserialize)]
struct ZipQuery {
    /// comma-separated outgoing ids
    ids: String,
    /// file name the phone suggests (its local time), e.g. "WireShift 2026-11-12 16.49.zip"
    name: Option<String>,
    /// phone's UTC offset in minutes: zip (DOS) times are local times
    tz: Option<i32>,
}

/// at most UTC±14h, like real time zones
const MAX_TZ_MINUTES: i64 = 14 * 60;

fn unique_zip_name(taken: &mut HashSet<String>, name: &str) -> String {
    let mut candidate = name.to_string();
    let mut n = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = match name.rsplit_once('.') {
            Some((stem, ext)) if !stem.is_empty() => format!("{stem} ({n}).{ext}"),
            _ => format!("{name} ({n})"),
        };
        n += 1;
    }
    candidate
}

fn zip_item(id: u32, taken: &mut HashSet<String>, tz_secs: i64) -> Result<ZipItem, ApiError> {
    let entry = outgoing::get(id).ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "Fayl yuborish ro'yxatida yo'q"))?;
    let meta = std::fs::metadata(&entry.path).map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "Fayl Mac'da topilmadi"))?;
    let unix = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
    let modified = (unix as i64 + tz_secs).max(0) as u64;
    let name = unique_zip_name(taken, &names::sanitize_file_name(&entry.name));
    Ok(ZipItem { name, path: entry.path, size: meta.len(), modified, sent: entry.sent, active: entry.active })
}

/// Only ids from the outgoing list; repeats are ignored
fn zip_items(ids: &str, tz_minutes: i32) -> Result<Vec<ZipItem>, ApiError> {
    let tz_secs = i64::from(tz_minutes).clamp(-MAX_TZ_MINUTES, MAX_TZ_MINUTES) * 60;
    let (mut seen, mut taken, mut items) = (HashSet::new(), HashSet::new(), Vec::new());
    for raw in ids.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        let id: u32 = raw.parse().map_err(|_| ApiError::new(StatusCode::BAD_REQUEST, "Fayl raqami noto'g'ri"))?;
        if !seen.insert(id) {
            continue;
        }
        if items.len() >= MAX_ZIP_FILES {
            return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "Bitta zip uchun fayllar juda ko'p"));
        }
        items.push(zip_item(id, &mut taken, tz_secs)?);
    }
    if items.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "Hech qanday fayl tanlanmagan"));
    }
    Ok(items)
}

fn zip_file_name(raw: Option<&str>) -> String {
    let base = names::sanitize_file_name(raw.unwrap_or("WireShift"));
    format!("{}.zip", base.strip_suffix(".zip").unwrap_or(&base))
}

/// Several files as ONE download: a stored .zip streamed with an exact Content-Length
async fn download_zip(State(ctx): State<Ctx>, Query(q): Query<ZipQuery>) -> Response {
    let ids = q.ids.clone();
    let tz = q.tz.unwrap_or(0);
    let items = match blocking(move || zip_items(&ids, tz)).await {
        Ok(items) => items,
        Err(e) => return e.into_response(),
    };
    let name = zip_file_name(q.name.as_deref());
    let total = zip::total_len(&items);
    tracing::info!(file = %name, files = items.len(), bytes = total, "wifi: zip download");
    let job = ctx.shared.add_zip(name.clone(), items.len(), total);
    let (tx, rx) = tokio::sync::mpsc::channel(4);
    tokio::spawn(zip::stream(items, tx, ctx.shared.clone(), job, ctx.cancel.clone()));
    Response::builder()
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_LENGTH, total)
        .header(header::CONTENT_DISPOSITION, content_disposition(&name, false))
        .body(Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx)))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// Small JPEG preview of an outgoing photo, made once with macOS `sips`
async fn thumb(State(ctx): State<Ctx>, Path(id): Path<u32>) -> Response {
    let Some(entry) = outgoing::get(id).filter(|e| e.kind == "image") else { return not_found("Rasm yo'q") };
    let out = ctx.shared.thumbs_dir.join(format!("{id}.jpg"));
    if !out.exists() {
        let _ = tokio::fs::create_dir_all(&ctx.shared.thumbs_dir).await;
        let made = tokio::process::Command::new("/usr/bin/sips")
            .args(["-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", "320"])
            .arg(&entry.path)
            .arg("--out")
            .arg(&out)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .is_ok_and(|s| s.success());
        if !made {
            return not_found("Rasm ko'rinishi tayyorlanmadi");
        }
    }
    match tokio::fs::read(&out).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, "image/jpeg")], bytes).into_response(),
        Err(_) => not_found("Rasm ko'rinishi tayyorlanmadi"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disposition_is_header_safe() {
        let d = content_disposition("Sayr \"1\"/ő.mov", false);
        assert!(HeaderValue::from_str(&d).is_ok());
        assert!(d.starts_with("attachment; filename=\"Sayr _1_/_.mov\""));
        assert!(content_disposition("a.jpg", true).starts_with("inline"));
    }

    #[test]
    fn zip_names() {
        let mut taken = HashSet::new();
        assert_eq!(unique_zip_name(&mut taken, "IMG_1.HEIC"), "IMG_1.HEIC");
        assert_eq!(unique_zip_name(&mut taken, "img_1.heic"), "img_1 (2).heic");
        assert_eq!(zip_file_name(Some("../WireShift 2026-11-12 16.49.zip")), "WireShift 2026-11-12 16.49.zip");
        assert_eq!(zip_file_name(None), "WireShift.zip");
        assert!(zip_items("", 0).is_err());
        assert!(zip_items("abc", 0).is_err());
        assert!(zip_items("4000000000", 0).is_err(), "ids outside the list are refused");
    }
}
