//! `<hyperlinks>`：外部 http(s) 目标来自工作表关系；`location`（工作簿内跳转）原生没有对应物，跳过。

use std::collections::HashSet;

use super::dom::Node;
use super::rels::Relationship;
use crate::address::parse_range;
use crate::native::Hyperlink;

/// 与引擎 `normalize_url` 同口径的保守预检：任何一条被引擎拒绝都会让整份文件打不开。
pub fn is_acceptable_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://")) else {
        return false;
    };
    if url.len() > 8192 || url.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
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

/// 一条链接覆盖的区域超过这个格数就只挂在左上角，避免整列链接生成上百万条。
const MAX_EXPANDED_CELLS: u64 = 256;

pub fn parse(extras: &Node, rels: &[Relationship], sheet: usize) -> Vec<Hyperlink> {
    let Some(links) = extras.child("hyperlinks") else { return Vec::new() };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for link in links.each("hyperlink") {
        let Some(url) = link.attr("id")
            .and_then(|id| rels.iter().find(|rel| rel.id == id && rel.external))
            .map(|rel| rel.target.clone())
            .filter(|url| is_acceptable_url(url)) else { continue };
        let Some([r1, c1, r2, c2]) = link.attr("ref").and_then(parse_range) else { continue };
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
    out
}
