//! 旧式批注 `commentsN.xml` → 原生备注（纯文本，作者与富文本样式不保留）。

use std::collections::HashSet;

use super::dom::{self, Node};
use crate::address::parse_cell;
use crate::native::Note;

const MAX_NOTE_CHARACTERS: usize = 32767;

/// 批注正文：所有 `<t>` 文本按顺序拼接，拼音注释 `<rPh>` 不算。
fn comment_text(text: &Node) -> String {
    let mut out = String::new();
    for child in &text.children {
        match child.name.as_str() {
            "t" => out.push_str(&child.text),
            "r" => out.push_str(&child.child("t").map(|t| t.text.as_str()).unwrap_or_default()),
            _ => {}
        }
    }
    out
}

pub fn parse(xml: &str, sheet: usize) -> (Vec<Note>, usize) {
    let Some(root) = dom::parse(xml, &[]) else { return (Vec::new(), 0) };
    let Some(list) = root.child("commentList") else { return (Vec::new(), 0) };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut threaded_placeholders = 0usize;
    for comment in list.each("comment") {
        let Some((row, col)) = comment.attr("ref").and_then(parse_cell) else { continue };
        let Some(text) = comment.child("text") else { continue };
        let text = comment_text(text).replace("\r\n", "\n").replace('\r', "\n").replace('\0', "");
        if text.starts_with("[Threaded comment]") {
            threaded_placeholders += 1;
            continue;
        }
        // Excel 的线程批注在旧部件里只留占位说明，不是用户写的备注。
        if text.trim().is_empty() || !seen.insert((row, col)) {
            continue;
        }
        let text: String = text.chars().take(MAX_NOTE_CHARACTERS).collect();
        out.push(Note { sheet, row, col, text });
    }
    (out, threaded_placeholders)
}
