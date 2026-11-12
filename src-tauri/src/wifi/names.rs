//! Safe file names for what the phone sends.

use std::path::{Path, PathBuf};

const MAX_NAME_BYTES: usize = 200;
const MAX_EXT_BYTES: usize = 16;

/// Keeps only the last path part, drops control chars and leading dots, so a name
/// like "../../x" can never leave the target folder or become a hidden file.
pub fn sanitize_file_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if c == ':' { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').trim_end_matches(['.', ' ']).trim();
    let name = if trimmed.is_empty() { "fayl" } else { trimmed };
    truncate_keep_ext(name, MAX_NAME_BYTES)
}

fn split_ext(name: &str) -> (&str, Option<&str>) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() && ext.len() <= MAX_EXT_BYTES => {
            (stem, Some(ext))
        }
        _ => (name, None),
    }
}

fn truncate_keep_ext(name: &str, max: usize) -> String {
    if name.len() <= max {
        return name.to_string();
    }
    let (stem, ext) = split_ext(name);
    let room = max - ext.map_or(0, |e| e.len() + 1);
    let mut cut = room.min(stem.len());
    while !stem.is_char_boundary(cut) {
        cut -= 1;
    }
    match ext {
        Some(e) => format!("{}.{e}", &stem[..cut]),
        None => stem[..cut].to_string(),
    }
}

fn taken(p: &Path) -> bool {
    p.symlink_metadata().is_ok()
}

/// dir/name, or "name (2).ext", "name (3).ext"... when it already exists. Never overwrites.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !taken(&first) {
        return first;
    }
    let (stem, ext) = split_ext(name);
    (2u32..)
        .map(|n| match ext {
            Some(e) => dir.join(format!("{stem} ({n}).{e}")),
            None => dir.join(format!("{stem} ({n})")),
        })
        .find(|p| !taken(p))
        .unwrap_or(first)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traversal_is_stripped() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("..\\..\\boot.ini"), "boot.ini");
        assert_eq!(sanitize_file_name(".."), "fayl");
        assert_eq!(sanitize_file_name("/"), "fayl");
        assert_eq!(sanitize_file_name(".hidden.mov"), "hidden.mov");
        assert_eq!(sanitize_file_name("a\u{0}b\nc.jpg"), "abc.jpg");
        assert_eq!(sanitize_file_name("IMG:1.HEIC"), "IMG_1.HEIC");
        assert_eq!(sanitize_file_name("Video ⭐️.mov"), "Video ⭐️.mov");
    }

    #[test]
    fn long_names_keep_extension() {
        let long = format!("{}.mov", "ж".repeat(300));
        let out = sanitize_file_name(&long);
        assert!(out.len() <= MAX_NAME_BYTES);
        assert!(out.ends_with(".mov"));
    }

    #[test]
    fn never_overwrites() {
        let dir = std::env::temp_dir().join(format!("ws-names-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "a.mov"), dir.join("a.mov"));
        std::fs::write(dir.join("a.mov"), b"1").unwrap();
        std::fs::write(dir.join("a (2).mov"), b"2").unwrap();
        assert_eq!(unique_path(&dir, "a.mov"), dir.join("a (3).mov"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
