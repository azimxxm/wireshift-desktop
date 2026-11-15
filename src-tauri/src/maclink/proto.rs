//! Wire format between two WireShift Macs.
//! Every message is a 4-byte big-endian length + JSON. A `Chunk` message is
//! followed by exactly that chunk's raw bytes.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const PROTO_VERSION: u32 = 1;
/// Big enough to keep Wi-Fi busy, small enough that a dropped link loses little
pub const CHUNK_SIZE: u64 = 8 * 1024 * 1024;
/// A manifest of ~100k files still fits
const MAX_FRAME: usize = 64 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    /// relative path, starts with one of `Manifest::roots`
    pub path: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Manifest {
    /// same files from the same Mac -> same id, so a transfer resumes even after a restart
    pub id: String,
    pub roots: Vec<String>,
    pub files: Vec<FileEntry>,
    /// every folder, so empty ones arrive too
    pub dirs: Vec<String>,
    pub total: u64,
}

/// One piece of one file
#[derive(Clone, Copy, Debug)]
pub struct Chunk {
    pub file: usize,
    pub offset: u64,
    pub len: u64,
}

impl Manifest {
    /// Global chunk table: files in order, each split into CHUNK_SIZE pieces (empty files have none)
    pub fn chunks(&self) -> Vec<Chunk> {
        let mut out = Vec::new();
        for (file, f) in self.files.iter().enumerate() {
            let mut offset = 0;
            while offset < f.size {
                let len = CHUNK_SIZE.min(f.size - offset);
                out.push(Chunk { file, offset, len });
                offset += len;
            }
        }
        out
    }

    /// Rejects anything that could write outside the target folder
    pub fn validate(&self) -> Result<(), String> {
        if self.roots.is_empty() {
            return Err("Bo'sh ro'yxat".into());
        }
        for r in &self.roots {
            if !is_safe_name(r) {
                return Err(format!("Noto'g'ri nom: {r}"));
            }
        }
        let paths = self.files.iter().map(|f| f.path.as_str()).chain(self.dirs.iter().map(String::as_str));
        for p in paths {
            if !is_safe_relative(p) || !self.roots.iter().any(|r| first_component(p) == r) {
                return Err(format!("Noto'g'ri yo'l: {p}"));
            }
        }
        let sum: u64 = self.files.iter().map(|f| f.size).sum();
        if sum != self.total {
            return Err("Hajm mos kelmadi".into());
        }
        Ok(())
    }
}

pub fn first_component(path: &str) -> &str {
    path.split('/').next().unwrap_or("")
}

fn is_safe_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\0'])
}

fn is_safe_relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\0')
        && Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
        && path.split('/').all(is_safe_name)
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Msg {
    /// sender -> receiver, first message on the control connection
    Offer {
        v: u32,
        from_id: String,
        from_name: String,
        from_model: String,
        /// 4 digits shown on both Macs
        code: String,
        /// given by the receiver when the user ticked "trust this Mac"
        secret: Option<String>,
        /// token of an interrupted session, to continue without asking again
        resume_token: Option<String>,
        manifest: Manifest,
    },
    Accept {
        token: String,
        /// new trust secret to remember for next time
        secret: Option<String>,
        /// chunks the receiver already has
        done: Vec<u32>,
    },
    Decline {
        reason: String,
    },
    /// sender -> receiver, first message on each data connection
    Data {
        token: String,
    },
    Chunk {
        c: u32,
        crc: u32,
    },
    Ack {
        c: u32,
    },
    /// bad checksum, send this chunk again
    Nack {
        c: u32,
    },
    Ping,
    Pause,
    Resume,
    Cancel {
        reason: String,
    },
    Finish,
    Done,
    Missing {
        chunks: Vec<u32>,
    },
}

pub async fn write_msg<W: AsyncWrite + Unpin>(w: &mut W, msg: &Msg) -> std::io::Result<()> {
    let body = serde_json::to_vec(msg).map_err(std::io::Error::other)?;
    w.write_all(&(body.len() as u32).to_be_bytes()).await?;
    w.write_all(&body).await?;
    w.flush().await
}

pub async fn read_msg<R: AsyncRead + Unpin>(r: &mut R) -> std::io::Result<Msg> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len).await?;
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(std::io::Error::other("frame too large"));
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).await?;
    serde_json::from_slice(&body).map_err(std::io::Error::other)
}

/// Random lowercase hex of `bytes` length
pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    if getrandom::fill(&mut buf).is_err() {
        // practically never; still don't hand out a predictable value silently
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        for (i, b) in buf.iter_mut().enumerate() {
            *b = (t >> ((i % 16) * 8)) as u8 ^ (i as u8).wrapping_mul(97);
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn constant_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(paths: &[(&str, u64)], roots: &[&str]) -> Manifest {
        Manifest {
            id: "x".into(),
            roots: roots.iter().map(|s| s.to_string()).collect(),
            files: paths.iter().map(|(p, s)| FileEntry { path: p.to_string(), size: *s }).collect(),
            dirs: vec![],
            total: paths.iter().map(|(_, s)| s).sum(),
        }
    }

    #[test]
    fn rejects_escaping_paths() {
        assert!(manifest(&[("a/b.mov", 3)], &["a"]).validate().is_ok());
        assert!(manifest(&[("a/../../etc/x", 3)], &["a"]).validate().is_err());
        assert!(manifest(&[("/etc/x", 3)], &["a"]).validate().is_err());
        assert!(manifest(&[("b/x", 3)], &["a"]).validate().is_err());
        assert!(manifest(&[("a/./x", 3)], &["a"]).validate().is_err());
        assert!(manifest(&[("a", 1)], &[".."]).validate().is_err());
    }

    #[test]
    fn chunk_table() {
        let m = manifest(&[("a", CHUNK_SIZE * 2 + 5), ("b", 0), ("c", 1)], &["a", "b", "c"]);
        let c = m.chunks();
        assert_eq!(c.len(), 4);
        assert_eq!(c[2].len, 5);
        assert_eq!(c[3].file, 2);
    }

    #[tokio::test]
    async fn frames_roundtrip() {
        let (mut a, mut b) = tokio::io::duplex(1024);
        write_msg(&mut a, &Msg::Ack { c: 7 }).await.unwrap();
        assert!(matches!(read_msg(&mut b).await.unwrap(), Msg::Ack { c: 7 }));
    }
}
