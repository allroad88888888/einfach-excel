use super::*;

pub(super) fn collect_textsplit_delims(v: &Value, include_empty: bool) -> Result<Vec<String>, ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Array(arr) => {
            let mut out = Vec::new();
            for elem in arr.data.iter() {
                match elem {
                    Value::Error(e) => return Err(e.clone()),
                    Value::Null => {
                        if include_empty {
                            out.push(String::new());
                        }
                    }
                    other => {
                        let s = coerce_to_text(other);
                        if !s.is_empty() || include_empty {
                            out.push(s);
                        }
                    }
                }
            }
            Ok(out)
        }
        Value::Null => {
            if include_empty {
                Ok(vec![String::new()])
            } else {
                Ok(Vec::new())
            }
        }
        other => {
            let s = coerce_to_text(other);
            if s.is_empty() && !include_empty {
                Ok(Vec::new())
            } else {
                Ok(vec![s])
            }
        }
    }
}

/// Walk `text` from byte position `start`, looking for the earliest start
/// position of any delimiter in `delims`. Returns `(byte_start, byte_end,
/// matched_index)` or `None`. `match_mode == 1` means case-insensitive
/// (we lower-case both sides before comparing — fine for ASCII; Unicode
/// case folding is best-effort via `to_lowercase()`).
pub(super) fn find_first_textsplit_delim(
    text: &str,
    delims: &[String],
    start: usize,
    match_mode: i64,
) -> Option<(usize, usize, usize)> {
    if delims.is_empty() || start > text.len() {
        return None;
    }
    let case_insensitive = match_mode == 1;
    let hay_lower: Option<String> = if case_insensitive {
        Some(text.to_lowercase())
    } else {
        None
    };
    let mut best: Option<(usize, usize, usize)> = None;
    for (idx, d) in delims.iter().enumerate() {
        if d.is_empty() {
            continue;
        }
        let needle: String;
        let needle_ref: &str = if case_insensitive {
            needle = d.to_lowercase();
            &needle
        } else {
            d.as_str()
        };
        let hay: &str = if case_insensitive {
            hay_lower.as_deref().unwrap()
        } else {
            text
        };
        // For case-insensitive search, `to_lowercase()` can change byte
        // length per char — we still want byte indices in the ORIGINAL
        // text, but with non-ASCII case-folding the lengths may differ.
        // We accept this best-effort limitation and search in the lowered
        // strings; the returned byte indices then point into the LOWERED
        // text. Since we use them to slice the lowered string for the
        // output, we must reconstruct via the original. To keep this
        // simple we restrict case-insensitive mode to byte-identical
        // length transformations (ASCII): if a delim is non-ASCII, fall
        // back to case-sensitive search for that delim so we don't
        // mis-slice. This matches Excel's behavior for typical usage.
        if case_insensitive && (!d.is_ascii() || !text.is_ascii()) {
            // ASCII-fallback: search the original text directly. This
            // means non-ASCII text matches case-sensitively under
            // match_mode=1 — documented gap.
            if let Some(pos) = text[start..].find(d.as_str()) {
                let abs = start + pos;
                let end = abs + d.len();
                match best {
                    Some((b, _, _)) if b <= abs => {}
                    _ => best = Some((abs, end, idx)),
                }
            }
            continue;
        }
        if let Some(pos) = hay[start..].find(needle_ref) {
            let abs = start + pos;
            let end = abs + needle_ref.len();
            match best {
                Some((b, _, _)) if b <= abs => {}
                _ => best = Some((abs, end, idx)),
            }
        }
    }
    best
}

/// Split `text` into fragments by `delims`, honoring `ignore_empty` and
/// `match_mode`. Returns the flat list of fragments in source order.
pub(super) fn textsplit_one_axis(
    text: &str,
    delims: &[String],
    ignore_empty: bool,
    match_mode: i64,
) -> Vec<String> {
    if delims.is_empty() {
        return vec![text.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    let mut pos = 0usize;
    while pos <= text.len() {
        match find_first_textsplit_delim(text, delims, pos, match_mode) {
            Some((s, e, _)) => {
                let frag = &text[pos..s];
                if !(ignore_empty && frag.is_empty()) {
                    out.push(frag.to_string());
                }
                pos = e;
                if pos > text.len() {
                    break;
                }
            }
            None => {
                let frag = &text[pos..];
                if !(ignore_empty && frag.is_empty()) {
                    out.push(frag.to_string());
                }
                break;
            }
        }
    }
    if out.is_empty() && !ignore_empty {
        // Excel TEXTSPLIT on "" returns a 1×1 with "". Keep that.
        out.push(String::new());
    }
    out
}
