//! Single `Range: bytes=...` header parsing (same rules as FleetDownloader's LAN server).

use axum::http::HeaderValue;

#[derive(Debug, PartialEq, Eq)]
pub enum ByteRange {
    Full,
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

fn num(s: &str) -> Option<u64> {
    s.trim().parse().ok()
}

/// No header = Full. Multi-range or malformed = Unsatisfiable. `end` is inclusive.
pub fn parse(value: Option<&HeaderValue>, total: u64) -> ByteRange {
    let Some(raw) = value.and_then(|v| v.to_str().ok()) else {
        return ByteRange::Full;
    };
    let Some((s, e)) = raw.trim().strip_prefix("bytes=").and_then(|spec| {
        if spec.contains(',') { None } else { spec.split_once('-') }
    }) else {
        return ByteRange::Unsatisfiable;
    };
    if total == 0 {
        return ByteRange::Unsatisfiable;
    }
    let last = total - 1;
    let (s, e) = (s.trim(), e.trim());
    let range = match (s.is_empty(), e.is_empty()) {
        // "-500" = last 500 bytes
        (true, false) => num(e).filter(|n| *n > 0).map(|n| (total.saturating_sub(n), last)),
        // "100-" = to the end
        (false, true) => num(s).map(|start| (start, last)),
        (false, false) => num(s).zip(num(e)).map(|(start, end)| (start, end.min(last))),
        (true, true) => None,
    };
    match range {
        Some((start, end)) if start <= end && start <= last => ByteRange::Partial { start, end },
        _ => ByteRange::Unsatisfiable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(v: &str, total: u64) -> ByteRange {
        parse(Some(&HeaderValue::from_str(v).unwrap()), total)
    }

    #[test]
    fn ranges() {
        assert_eq!(parse(None, 10), ByteRange::Full);
        assert_eq!(p("bytes=0-4", 10), ByteRange::Partial { start: 0, end: 4 });
        assert_eq!(p("bytes=5-", 10), ByteRange::Partial { start: 5, end: 9 });
        assert_eq!(p("bytes=-3", 10), ByteRange::Partial { start: 7, end: 9 });
        assert_eq!(p("bytes=8-100", 10), ByteRange::Partial { start: 8, end: 9 });
        assert_eq!(p("bytes=10-", 10), ByteRange::Unsatisfiable);
        assert_eq!(p("bytes=0-1,4-5", 10), ByteRange::Unsatisfiable);
        assert_eq!(p("bytes=5-2", 10), ByteRange::Unsatisfiable);
        assert_eq!(p("items=0-1", 10), ByteRange::Unsatisfiable);
    }
}
