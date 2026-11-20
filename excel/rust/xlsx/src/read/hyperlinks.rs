//! `<hyperlinks>`：外部 `http(s)` 关系目标与工作簿内部 `location` 跳转目标（存为 `#...`）。

use std::collections::HashSet;

use super::dom::Node;
use super::rels::Relationship;
use crate::address::{column_name, parse_column, parse_range};
use crate::native::{Hyperlink, MAX_COLS, MAX_ROWS};

const MAX_HYPERLINK_BYTES: usize = 8192;
/// 一条链接覆盖的区域超过这个格数就只挂在左上角，避免整列链接生成上百万条。
const MAX_EXPANDED_CELLS: u64 = 256;

/// 与引擎 `normalize_url` 同口径的保守预检：任何一条被引擎拒绝都会让整份文件打不开。
pub fn is_acceptable_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://")) else {
        return false;
    };
    if url.len() > MAX_HYPERLINK_BYTES
        || url.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\')
    {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') {
        return false;
    }
    match authority.rsplit_once(':') {
        Some((host, port)) if !authority.ends_with(']') => {
            !host.is_empty() && !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit())
        }
        _ => true,
    }
}

fn is_bare_sheet_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else { return false };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return false;
    }
    !name.eq_ignore_ascii_case("TRUE") && !name.eq_ignore_ascii_case("FALSE")
}

fn push_sheet_name(out: &mut String, name: &str) {
    if is_bare_sheet_name(name) {
        out.push_str(name);
        return;
    }
    out.push('\'');
    for ch in name.chars() {
        if ch == '\'' {
            out.push('\'');
        }
        out.push(ch);
    }
    out.push('\'');
}

fn split_sheet_prefix(loc: &str) -> Option<(Option<String>, &str)> {
    if let Some(after_open) = loc.strip_prefix('\'') {
        let mut chars = after_open.char_indices().peekable();
        let mut sheet = String::new();
        while let Some((idx, ch)) = chars.next() {
            if ch == '\'' {
                if chars.peek().is_some_and(|&(_, next)| next == '\'') {
                    chars.next();
                    sheet.push('\'');
                } else {
                    let rest = &after_open[idx + 1..];
                    let target = rest.strip_prefix('!')?;
                    if sheet.is_empty() || sheet.chars().count() > 255 || sheet.contains(':') {
                        return None;
                    }
                    return Some((Some(sheet), target));
                }
            } else {
                sheet.push(ch);
            }
        }
        return None;
    }
    if let Some((raw_sheet, target)) = loc.split_once('!') {
        let mut chars = raw_sheet.chars();
        let first = chars.next()?;
        if raw_sheet.chars().count() > 255
            || first.is_ascii_digit()
            || !(first.is_alphanumeric() || first == '_' || first == '\\')
            || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.')
            || raw_sheet.eq_ignore_ascii_case("TRUE")
            || raw_sheet.eq_ignore_ascii_case("FALSE")
        {
            return None;
        }
        return Some((Some(raw_sheet.to_string()), target));
    }
    Some((None, loc))
}

fn parse_abs_cell(token: &str) -> Option<String> {
    let (col_abs, rest) = token.strip_prefix('$').map_or((false, token), |r| (true, r));
    let split = rest.find(|c: char| !c.is_ascii_alphabetic())?;
    let (letters, rest) = rest.split_at(split);
    if letters.is_empty() || letters.len() > 3 {
        return None;
    }
    let (row_abs, digits) = rest.strip_prefix('$').map_or((false, rest), |r| (true, r));
    if digits.is_empty() || digits.starts_with('0') || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let col = parse_column(letters)?;
    let row: u32 = digits.parse().ok()?;
    if col >= MAX_COLS || !(1..=MAX_ROWS).contains(&row) {
        return None;
    }
    Some(format!(
        "{}{}{}{}",
        if col_abs { "$" } else { "" },
        column_name(col),
        if row_abs { "$" } else { "" },
        row
    ))
}

fn is_r1c1_like(upper: &str) -> bool {
    let Some(rest) = upper.strip_prefix('R') else { return false };
    let row_digits = rest.bytes().take_while(|b| b.is_ascii_digit()).count();
    let Some(col_digits) = rest[row_digits..].strip_prefix('C') else { return false };
    !col_digits.is_empty() && col_digits.bytes().all(|b| b.is_ascii_digit())
        || (row_digits > 0 && col_digits.is_empty())
}

fn normalize_target(target: &str) -> Option<String> {
    if target.is_empty() || target.chars().any(|c| c.is_whitespace() || c == '!' || c == '\'') {
        return None;
    }
    if let Some((left, right)) = target.split_once(':') {
        let c1 = parse_abs_cell(left)?;
        let c2 = parse_abs_cell(right)?;
        return Some(format!("{c1}:{c2}"));
    }
    if let Some(cell) = parse_abs_cell(target) {
        return Some(cell);
    }
    let mut chars = target.chars();
    let first = chars.next()?;
    if target.chars().count() > 255
        || !(first.is_alphabetic() || first == '_')
        || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    {
        return None;
    }
    let upper = target.to_ascii_uppercase();
    if matches!(upper.as_str(), "R" | "C" | "TRUE" | "FALSE") || is_r1c1_like(&upper) {
        return None;
    }
    Some(target.to_string())
}

pub fn normalize_internal_location(
    loc: &str,
    raw_sheets: &[String],
    final_sheets: &[String],
) -> Option<String> {
    let trimmed = loc.trim();
    let body = trimmed.strip_prefix('#').unwrap_or(trimmed).trim();
    if body.is_empty() || body.chars().any(char::is_control) {
        return None;
    }
    let (sheet_opt, raw_target) = split_sheet_prefix(body)?;
    let target = normalize_target(raw_target)?;
    let mut out = String::from("#");
    if let Some(raw_sheet) = sheet_opt {
        let mapped = raw_sheets
            .iter()
            .position(|s| s.eq_ignore_ascii_case(&raw_sheet))
            .and_then(|i| final_sheets.get(i))
            .map(String::as_str)
            .unwrap_or(&raw_sheet);
        push_sheet_name(&mut out, mapped);
        out.push('!');
    }
    out.push_str(&target);
    (out.len() <= MAX_HYPERLINK_BYTES).then_some(out)
}

pub struct ParsedHyperlinks {
    pub links: Vec<Hyperlink>,
    pub display_fallbacks: Vec<(u32, u32, String)>,
    pub skipped: usize,
}

pub fn parse(
    extras: &Node,
    rels: &[Relationship],
    sheet: usize,
    raw_sheets: &[String],
    final_sheets: &[String],
) -> ParsedHyperlinks {
    let Some(links) = extras.child("hyperlinks") else {
        return ParsedHyperlinks { links: Vec::new(), display_fallbacks: Vec::new(), skipped: 0 };
    };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut display_fallbacks = Vec::new();
    let mut skipped = 0usize;
    for link in links.each("hyperlink") {
        let target_url = if let Some(id) = link.attr("id") {
            rels.iter()
                .find(|rel| rel.id == id && rel.external)
                .and_then(|rel| {
                    if is_acceptable_url(&rel.target) {
                        Some(rel.target.clone())
                    } else if rel.target.trim_start().starts_with('#') {
                        normalize_internal_location(&rel.target, raw_sheets, final_sheets)
                    } else {
                        None
                    }
                })
                .or_else(|| {
                    link.attr("location")
                        .and_then(|loc| normalize_internal_location(loc, raw_sheets, final_sheets))
                })
        } else if let Some(loc) = link.attr("location") {
            normalize_internal_location(loc, raw_sheets, final_sheets)
        } else {
            None
        };
        let Some(url) = target_url else {
            skipped += 1;
            continue;
        };
        let Some([r1, c1, r2, c2]) = link.attr("ref").and_then(parse_range) else {
            skipped += 1;
            continue;
        };
        if let Some(display) = link.attr("display").filter(|s| !s.trim().is_empty()) {
            display_fallbacks.push((r1, c1, display.to_string()));
        }
        let cells = u64::from(r2 - r1 + 1) * u64::from(c2 - c1 + 1);
        let (r2, c2) = if cells > MAX_EXPANDED_CELLS { (r1, c1) } else { (r2, c2) };
        for row in r1..=r2 {
            for col in c1..=c2 {
                if seen.insert((row, col)) {
                    out.push(Hyperlink { sheet, row, col, url: url.clone() });
                }
            }
        }
    }
    ParsedHyperlinks { links: out, display_fallbacks, skipped }
}
