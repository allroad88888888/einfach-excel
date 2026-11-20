//! `xl/persons/person.xml` 与 `xl/threadedComments/*.xml` → 原生工作簿本地批注线程（`comments`）。

use std::collections::{HashMap, HashSet};

use super::dom::{self, Node};
use crate::address::parse_cell;
use crate::native::{CommentThread, Thread, ThreadEntry};

const MAX_AUTHOR_CHARS: usize = 100;
const MAX_COMMENT_CHARS: usize = 32_767;
const MAX_THREAD_ENTRIES: usize = 1_000;
const MAX_TIMESTAMP_MS: i64 = 8_640_000_000_000_000;

pub fn parse_persons(xml: Option<&str>) -> Vec<(String, String)> {
    let Some(root) = xml.and_then(|s| dom::parse(s, &[])) else {
        return Vec::new();
    };
    root.each("person")
        .filter_map(|p| {
            let id = p.attr("id")?.trim();
            let name = p.attr("displayName").unwrap_or_default().trim();
            (!id.is_empty() && !name.is_empty()).then(|| (id.to_string(), name.to_string()))
        })
        .collect()
}

fn normalize_author(raw: Option<&str>) -> String {
    let cleaned: String = raw
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let truncated: String = cleaned.trim().chars().take(MAX_AUTHOR_CHARS).collect();
    let final_name = truncated.trim();
    if final_name.is_empty() { "Author".into() } else { final_name.into() }
}

fn lookup_author<'a>(person_id: Option<&str>, persons: &'a [(String, String)]) -> String {
    let found = person_id.map(str::trim).filter(|s| !s.is_empty()).and_then(|id| {
        persons
            .iter()
            .find(|(pid, _)| pid == id)
            .or_else(|| persons.iter().find(|(pid, _)| pid.eq_ignore_ascii_case(id)))
            .map(|(_, name)| name.as_str())
    });
    normalize_author(found)
}

fn utf16_offset_to_byte(text: &str, utf16_units: usize) -> Option<usize> {
    if utf16_units == 0 {
        return Some(0);
    }
    let mut seen = 0usize;
    for (idx, ch) in text.char_indices() {
        if seen == utf16_units {
            return Some(idx);
        }
        seen += ch.len_utf16();
        if seen > utf16_units {
            return None;
        }
    }
    (seen == utf16_units).then_some(text.len())
}

fn strip_leading_sep(rest: &str) -> &str {
    rest.strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'))
        .or_else(|| rest.strip_prefix('\r'))
        .or_else(|| rest.strip_prefix(' '))
        .or_else(|| rest.strip_prefix('\t'))
        .unwrap_or(rest)
}

fn strip_leading_mention(raw: &str, comment: &Node, persons: &[(String, String)]) -> String {
    if let Some(mentions) = comment.child("mentions") {
        let mut zero_len = 0usize;
        for m in mentions.each("mention") {
            if m.attr_u32("startIndex") == Some(0) {
                if let Some(len) = m.attr_u32("length") {
                    zero_len = zero_len.max(len as usize);
                }
            }
        }
        if zero_len > 0 {
            if let Some(end_byte) = utf16_offset_to_byte(raw, zero_len) {
                if raw[..end_byte].starts_with('@') {
                    let rest = strip_leading_sep(&raw[end_byte..]);
                    if !rest.trim().is_empty() {
                        return rest.to_string();
                    }
                }
            }
        }
    } else if let Some(after_at) = raw.strip_prefix('@') {
        for (_, display_name) in persons {
            if let Some(after_name) = after_at.strip_prefix(display_name.as_str()) {
                if after_name.starts_with([' ', '\t', '\r', '\n']) {
                    let rest = strip_leading_sep(after_name);
                    if !rest.trim().is_empty() {
                        return rest.to_string();
                    }
                }
            }
        }
    }
    raw.to_string()
}

fn normalize_body(raw: &str) -> Option<String> {
    let normalized = raw.replace("\r\n", "\n").replace('\r', "\n").replace('\0', "");
    if normalized.trim().is_empty() {
        return None;
    }
    let truncated: String = normalized.chars().take(MAX_COMMENT_CHARS).collect();
    (!truncated.trim().is_empty()).then_some(truncated)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - i64::from(month <= 2);
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// 解析 ISO-8601 `YYYY-MM-DDTHH:MM:SS(.sss)(Z|±HH:MM)?` 为非负毫秒时间戳。
fn parse_timestamp_ms(dt: Option<&str>) -> Option<i64> {
    let s = dt?.trim();
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    let mut rest = &s[19..];
    let mut millis = 0i64;
    if let Some(after_dot) = rest.strip_prefix('.') {
        let digits: String = after_dot.chars().take_while(|c| c.is_ascii_digit()).collect();
        rest = &after_dot[digits.len()..];
        let mut padded = digits;
        padded.truncate(3);
        while padded.len() < 3 {
            padded.push('0');
        }
        millis = padded.parse().unwrap_or(0);
    }
    let mut tz_offset_ms = 0i64;
    let rest = rest.trim();
    if let Some(sign) = rest.chars().next().filter(|&c| c == '+' || c == '-') {
        let off = &rest[1..];
        let (oh, om) = if let Some((h, m)) = off.split_once(':') {
            (h.parse::<i64>().ok()?, m.parse::<i64>().ok()?)
        } else if off.len() == 4 {
            (off[0..2].parse::<i64>().ok()?, off[2..4].parse::<i64>().ok()?)
        } else {
            (0, 0)
        };
        let delta = (oh * 3600 + om * 60) * 1000;
        tz_offset_ms = if sign == '+' { -delta } else { delta };
    }
    let days = days_from_civil(year, month, day);
    let total = days
        .saturating_mul(86_400_000)
        .saturating_add((hour * 3600 + minute * 60 + second) * 1000)
        .saturating_add(millis)
        .saturating_add(tz_offset_ms);
    Some(total.clamp(0, MAX_TIMESTAMP_MS))
}

struct RawItem {
    coord: Option<(u32, u32)>,
    id: Option<String>,
    parent_id: Option<String>,
    author: String,
    body: Option<String>,
    timestamp: Option<i64>,
    done: bool,
}

pub fn parse_sheet(
    xml: &str,
    persons: &[(String, String)],
    sheet: usize,
    seen_cells: &mut HashSet<(u32, u32)>,
) -> Vec<CommentThread> {
    let Some(root) = dom::parse(xml, &[]) else {
        return Vec::new();
    };
    let mut id_to_coord: HashMap<String, (u32, u32)> = HashMap::new();
    let mut raw_items = Vec::new();
    for node in root.each("threadedComment") {
        let coord = node.attr("ref").and_then(parse_cell);
        let id = node.attr("id").map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        if let (Some(id), Some(c)) = (&id, coord) {
            id_to_coord.insert(id.clone(), c);
        }
        let parent_id = node
            .attr("parentId")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let author = lookup_author(node.attr("personId"), persons);
        let raw_text = node.child("text").map(|t| t.text.as_str()).unwrap_or_default();
        let stripped = strip_leading_mention(raw_text, node, persons);
        let body = normalize_body(&stripped);
        let timestamp = parse_timestamp_ms(node.attr("dT"));
        let done = matches!(node.attr("done").map(str::trim), Some("1" | "true"));
        raw_items.push(RawItem { coord, id, parent_id, author, body, timestamp, done });
    }

    let mut order: Vec<(u32, u32)> = Vec::new();
    let mut grouped: HashMap<(u32, u32), Vec<RawItem>> = HashMap::new();
    for item in raw_items {
        let coord = item.coord.or_else(|| {
            item.parent_id.as_deref().and_then(|pid| {
                id_to_coord.get(pid).copied().or_else(|| {
                    id_to_coord
                        .iter()
                        .find(|(k, _)| k.eq_ignore_ascii_case(pid))
                        .map(|(_, &v)| v)
                })
            })
        });
        let Some(coord) = coord else { continue };
        if let Some(id) = &item.id {
            id_to_coord.entry(id.clone()).or_insert(coord);
        }
        if !grouped.contains_key(&coord) {
            order.push(coord);
        }
        grouped.entry(coord).or_default().push(item);
    }

    let mut out = Vec::new();
    for coord in order {
        if !seen_cells.insert(coord) {
            continue;
        }
        let Some(items) = grouped.remove(&coord) else { continue };
        let resolved = items.iter().any(|item| item.done);
        let max_messages = if resolved { MAX_THREAD_ENTRIES - 1 } else { MAX_THREAD_ENTRIES };
        let mut entries = Vec::new();
        let mut prev_ts = 0i64;
        let mut resolve_author: Option<String> = None;
        for item in items {
            if item.done {
                resolve_author = Some(item.author.clone());
            }
            let Some(body) = item.body else { continue };
            if entries.len() >= max_messages {
                break;
            }
            let ts = item.timestamp.unwrap_or(prev_ts).max(prev_ts).min(MAX_TIMESTAMP_MS);
            prev_ts = ts;
            if resolve_author.is_none() {
                resolve_author = Some(item.author.clone());
            }
            entries.push(ThreadEntry {
                kind: "message".into(),
                author: item.author,
                body: Some(body),
                created_at: ts,
            });
        }
        if entries.is_empty() {
            seen_cells.remove(&coord);
            continue;
        }
        if resolved {
            let author = resolve_author.unwrap_or_else(|| entries[0].author.clone());
            entries.push(ThreadEntry { kind: "resolve".into(), author, body: None, created_at: prev_ts });
        }
        out.push(CommentThread { sheet, row: coord.0, col: coord.1, thread: Thread { entries, resolved } });
    }
    out
}
