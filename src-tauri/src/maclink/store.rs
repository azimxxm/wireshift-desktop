//! What this Mac remembers between launches: its id, trusted Macs, the receive folder.

use super::proto::random_hex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};

#[derive(Serialize, Deserialize, Default, Clone)]
struct Saved {
    id: String,
    /// receiver side: sender id -> secret that skips the accept dialog
    trusted: HashMap<String, Trusted>,
    /// sender side: receiver id -> secret it gave us
    secrets: HashMap<String, String>,
    receive_dir: Option<String>,
    /// name other Macs see; None = the macOS computer name
    #[serde(default)]
    display_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Trusted {
    name: String,
    secret: String,
}

static STORE: OnceLock<Mutex<Saved>> = OnceLock::new();

pub fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/tmp"))
}

pub fn support_dir() -> PathBuf {
    home().join("Library/Application Support/uz.azimjondev.wireshift/maclink")
}

fn file() -> PathBuf {
    support_dir().join("maclink.json")
}

fn store() -> MutexGuard<'static, Saved> {
    STORE
        .get_or_init(|| {
            let mut s: Saved = std::fs::read(file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
            if s.id.len() != 32 {
                s.id = random_hex(16);
                save(&s);
            }
            Mutex::new(s)
        })
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn save(s: &Saved) {
    let _ = std::fs::create_dir_all(support_dir());
    match serde_json::to_vec_pretty(s) {
        Ok(bytes) => {
            if let Err(e) = std::fs::write(file(), bytes) {
                tracing::warn!("maclink: could not save settings: {e}");
            }
        }
        Err(e) => tracing::warn!("maclink: could not encode settings: {e}"),
    }
}

pub fn my_id() -> String {
    store().id.clone()
}

pub fn receive_dir() -> PathBuf {
    store().receive_dir.as_ref().map(PathBuf::from).unwrap_or_else(|| home().join("Downloads"))
}

pub fn set_receive_dir(dir: &str) {
    let mut s = store();
    s.receive_dir = Some(dir.to_string());
    save(&s);
}

pub fn is_trusted(from_id: &str, secret: Option<&str>) -> bool {
    let s = store();
    match (s.trusted.get(from_id), secret) {
        (Some(t), Some(given)) => super::proto::constant_eq(&t.secret, given),
        _ => false,
    }
}

/// New secret for a sender the user chose to trust
pub fn trust(from_id: &str, name: &str) -> String {
    let secret = random_hex(16);
    let mut s = store();
    s.trusted.insert(from_id.to_string(), Trusted { name: name.to_string(), secret: secret.clone() });
    save(&s);
    secret
}

pub fn trusted_names() -> Vec<String> {
    store().trusted.values().map(|t| t.name.clone()).collect()
}

pub fn forget_trusted() {
    let mut s = store();
    s.trusted.clear();
    save(&s);
}

pub fn secret_for(peer_id: &str) -> Option<String> {
    store().secrets.get(peer_id).cloned()
}

pub fn remember_secret(peer_id: &str, secret: &str) {
    let mut s = store();
    s.secrets.insert(peer_id.to_string(), secret.to_string());
    save(&s);
}

/// The name other Macs see (the user can rename it on the Mac ↔ Mac page)
pub fn display_name() -> String {
    store().display_name.clone().unwrap_or_else(computer_name)
}

pub const MAX_NAME_CHARS: usize = 40;

/// Empty name = back to the macOS computer name
pub fn set_display_name(name: &str) -> Result<String, String> {
    let clean: String = name.chars().filter(|c| !c.is_control()).collect::<String>().trim().to_string();
    if clean.chars().count() > MAX_NAME_CHARS {
        return Err(format!("Nom {MAX_NAME_CHARS} belgidan oshmasin"));
    }
    let mut s = store();
    s.display_name = (!clean.is_empty()).then_some(clean);
    save(&s);
    drop(s);
    Ok(display_name())
}

/// "MacBook Pro", "Mac mini"... read once, `system_profiler` takes ~0.5 s
pub fn model_name() -> String {
    static MODEL: OnceLock<String> = OnceLock::new();
    MODEL
        .get_or_init(|| {
            let out = std::process::Command::new("/usr/sbin/system_profiler").arg("SPHardwareDataType").output();
            out.ok()
                .and_then(|o| {
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .find_map(|l| l.trim().strip_prefix("Model Name:").map(|v| v.trim().to_string()))
                })
                .unwrap_or_else(|| "Mac".into())
        })
        .clone()
}

/// The name from System Settings > General > Sharing (read once per launch)
pub fn computer_name() -> String {
    static NAME: OnceLock<String> = OnceLock::new();
    NAME.get_or_init(read_computer_name).clone()
}

fn read_computer_name() -> String {
    std::process::Command::new("/usr/sbin/scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(model_name)
}

/// Free bytes on the volume that holds `path` (or its nearest existing parent)
pub fn free_space(path: &std::path::Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let mut p = path.to_path_buf();
    while !p.exists() {
        p = p.parent()?.to_path_buf();
    }
    let c = std::ffi::CString::new(p.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: c is a valid NUL-terminated path and st is a properly sized out-param
    if unsafe { libc::statfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    Some(st.f_bavail as u64 * st.f_bsize as u64)
}

/// Keeps the Mac from sleeping while it lives (`caffeinate -i` tied to our pid)
pub struct KeepAwake(Option<std::process::Child>);

impl KeepAwake {
    pub fn new() -> Self {
        let child = std::process::Command::new("/usr/bin/caffeinate")
            .args(["-i", "-w", &std::process::id().to_string()])
            .spawn()
            .map_err(|e| tracing::warn!("maclink: caffeinate failed: {e}"))
            .ok();
        KeepAwake(child)
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        if let Some(c) = self.0.as_mut() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}
