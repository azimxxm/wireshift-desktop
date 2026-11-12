//! What one running Wi-Fi session knows: its key, folder, uploads and the phone.

use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use super::lock;
use super::upload::Upload;

/// The phone counts as connected while it polled within this window
const PHONE_SEEN_WINDOW_MS: u64 = 8_000;

struct Phone {
    ip: IpAddr,
    label: String,
    seen_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PhoneView {
    pub ip: String,
    pub label: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct IncomingView {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub received: u64,
    pub saved_as: Option<String>,
}

pub struct Shared {
    pub token: String,
    /// export folder / "Wi-Fi 2026-11-12 16.30"
    pub dest_dir: PathBuf,
    pub thumbs_dir: PathBuf,
    pub uploads: Mutex<Vec<Arc<Upload>>>,
    /// one finish at a time, so two files never pick the same free name
    pub finish_lock: Mutex<()>,
    started: Instant,
    last_seen_ms: AtomicU64,
    phone: Mutex<Option<Phone>>,
    received_total: AtomicU64,
    sent_total: AtomicU64,
}

/// 128-bit random session key as hex
pub fn new_token() -> Result<String, String> {
    let mut buf = [0u8; 16];
    getrandom::fill(&mut buf).map_err(|e| format!("Tasodifiy kalit yaratilmadi: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// Compares without an early exit, so timing does not leak how much matched
pub fn token_eq(given: &str, expected: &str) -> bool {
    given.len() == expected.len()
        && given.bytes().zip(expected.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

fn device_label(user_agent: &str) -> &'static str {
    ["iPhone", "iPad", "Android", "Macintosh"]
        .into_iter()
        .find(|k| user_agent.contains(k))
        .map_or("Brauzer", |k| if k == "Macintosh" { "Mac" } else { k })
}

impl Shared {
    pub fn new(token: String, dest_dir: PathBuf) -> Self {
        let thumbs_dir = std::env::temp_dir().join(format!("wireshift-wifi-{}", &token[..8]));
        Self {
            token,
            dest_dir,
            thumbs_dir,
            uploads: Mutex::new(Vec::new()),
            finish_lock: Mutex::new(()),
            started: Instant::now(),
            last_seen_ms: AtomicU64::new(0),
            phone: Mutex::new(None),
            received_total: AtomicU64::new(0),
            sent_total: AtomicU64::new(0),
        }
    }

    fn now_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Every allowed request lands here: keeps the session alive and shows the phone
    pub fn touch(&self, ip: IpAddr, user_agent: &str) {
        let now = self.now_ms();
        self.last_seen_ms.store(now, Ordering::Relaxed);
        *lock(&self.phone) = Some(Phone { ip, label: device_label(user_agent).to_string(), seen_ms: now });
    }

    pub fn idle_for(&self) -> Duration {
        Duration::from_millis(self.now_ms().saturating_sub(self.last_seen_ms.load(Ordering::Relaxed)))
    }

    pub fn add_received(&self, n: u64) {
        self.received_total.fetch_add(n, Ordering::Relaxed);
    }

    /// Download bytes also count as activity: one big video is a single long request
    pub fn add_sent(&self, n: u64) {
        self.sent_total.fetch_add(n, Ordering::Relaxed);
        self.last_seen_ms.store(self.now_ms(), Ordering::Relaxed);
    }

    pub fn totals(&self) -> (u64, u64) {
        (self.received_total.load(Ordering::Relaxed), self.sent_total.load(Ordering::Relaxed))
    }

    pub fn find_upload(&self, id: &str) -> Option<Arc<Upload>> {
        lock(&self.uploads).iter().find(|u| u.id == id).cloned()
    }

    pub fn phone(&self) -> Option<PhoneView> {
        let now = self.now_ms();
        lock(&self.phone).as_ref().map(|p| PhoneView {
            ip: p.ip.to_string(),
            label: p.label.clone(),
            connected: now.saturating_sub(p.seen_ms) < PHONE_SEEN_WINDOW_MS,
        })
    }

    pub fn incoming(&self) -> Vec<IncomingView> {
        lock(&self.uploads).iter().map(|u| u.view()).collect()
    }

    /// After the server stops: half-received temp files and thumbnails go away,
    /// the session folder too if nothing was saved into it.
    pub fn cleanup(&self) {
        for up in lock(&self.uploads).iter() {
            up.discard_if_unfinished();
        }
        let _ = std::fs::remove_dir_all(&self.thumbs_dir);
        let _ = std::fs::remove_dir(&self.dest_dir); // only succeeds when empty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens() {
        let t = new_token().unwrap();
        assert_eq!(t.len(), 32);
        assert_ne!(t, new_token().unwrap());
        assert!(token_eq(&t, &t.clone()));
        assert!(!token_eq(&t, &t[..31]));
        assert!(!token_eq("", &t));
    }

    #[test]
    fn labels() {
        assert_eq!(device_label("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)"), "iPhone");
        assert_eq!(device_label("curl/8.0"), "Brauzer");
    }
}
