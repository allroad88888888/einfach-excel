use super::*;

/// Parse the textual reference accepted by `INDIRECT`. Returns the optional
/// sheet name and the resolved start/end addresses (start == end for a
/// single-cell ref). Supports:
///
/// - `A1`, `$A$1`, `$A1`, `A$1` (absolute/relative markers are stripped).
/// - `A1:B3` ranges of two such refs.
/// - Optional `Sheet!` prefix. Bare names must match
///   `[A-Za-z_][A-Za-z0-9_]*`; quoted names use Excel's `'Sheet Name'!`
///   syntax, with doubled single quotes escaped as `''`.
pub(super) fn parse_indirect_ref(text: &str) -> Option<(Option<String>, CellAddress, CellAddress)> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let (sheet, body) = parse_indirect_sheet_prefix(text)?;
    let (start, end) = parse_indirect_body(body)?;
    Some((sheet, start, end))
}

fn parse_indirect_sheet_prefix(text: &str) -> Option<(Option<String>, &str)> {
    if let Some(quoted) = text.strip_prefix('\'') {
        let mut sheet = String::new();
        let mut chars = quoted.char_indices().peekable();
        while let Some((index, ch)) = chars.next() {
            if ch != '\'' {
                sheet.push(ch);
                continue;
            }
            if matches!(chars.peek(), Some((_, '\''))) {
                chars.next();
                sheet.push('\'');
                continue;
            }
            let body = quoted[index + ch.len_utf8()..].strip_prefix('!')?;
            return (!body.is_empty()).then_some((Some(sheet), body));
        }
        return None;
    }

    match text.find('!') {
        Some(i) => {
            let s = &text[..i];
            let rest = &text[i + 1..];
            if s.is_empty() {
                return None;
            }
            let valid = s.chars().enumerate().all(|(i, c)| {
                if i == 0 {
                    c.is_ascii_alphabetic() || c == '_'
                } else {
                    c.is_ascii_alphanumeric() || c == '_'
                }
            });
            if !valid {
                return None;
            }
            Some((Some(s.to_string()), rest))
        }
        None => Some((None, text)),
    }
}

pub(super) fn parse_indirect_body(body: &str) -> Option<(CellAddress, CellAddress)> {
    let (start_str, end_str) = match body.find(':') {
        Some(i) => (&body[..i], Some(&body[i + 1..])),
        None => (body, None),
    };
    if let Some(end_str) = end_str {
        let start_part = strip_abs_markers(start_str);
        let end_part = strip_abs_markers(end_str);
        if !start_part.is_empty()
            && !end_part.is_empty()
            && start_part.chars().all(|c| c.is_ascii_alphabetic())
            && end_part.chars().all(|c| c.is_ascii_alphabetic())
        {
            let start_col = CellAddress::parse(&format!("{}1", start_part))?.col;
            let end_col = CellAddress::parse(&format!("{}1", end_part))?.col;
            return Some((
                CellAddress::new(0, start_col),
                CellAddress::new(u32::MAX, end_col),
            ));
        }
        if !start_part.is_empty()
            && !end_part.is_empty()
            && start_part.chars().all(|c| c.is_ascii_digit())
            && end_part.chars().all(|c| c.is_ascii_digit())
        {
            let start_row: u32 = start_part.parse().ok()?;
            let end_row: u32 = end_part.parse().ok()?;
            if start_row == 0 || end_row == 0 {
                return None;
            }
            return Some((
                CellAddress::new(start_row - 1, 0),
                CellAddress::new(end_row - 1, u32::MAX),
            ));
        }
        return Some((
            parse_indirect_addr(start_str)?,
            parse_indirect_addr(end_str)?,
        ));
    }
    let start = parse_indirect_addr(start_str)?;
    Some((start, start))
}

/// Parse a single A1-style cell ref, tolerating the `$` absolute markers
/// (which are dropped — INDIRECT itself doesn't surface absoluteness).
pub(super) fn parse_indirect_addr(s: &str) -> Option<CellAddress> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // Strip leading $ (column absolute) and any $ before the row digits.
    let stripped = strip_abs_markers(s);
    CellAddress::parse(&stripped)
}

pub(super) fn strip_abs_markers(s: &str) -> String {
    s.trim().chars().filter(|c| *c != '$').collect()
}
