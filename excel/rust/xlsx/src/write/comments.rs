//! 原生备注 → 旧式批注部件 `commentsN.xml`。
//! 没有备注的格子若有线程批注，把线程折成 "作者: 正文" 多行文字当备注写出（XLSX 线程批注需要
//! persons 等一整套部件，这里不写）。

use std::collections::BTreeMap;

use super::xml::escape;
use crate::address::cell_name;
use crate::native::{CommentThread, Note};

/// 单个工作表的批注文字，按 (行, 列) 排序；同时返回折成备注的线程批注数。
pub fn collect(sheet: usize, notes: &[Note], threads: &[CommentThread]) -> (BTreeMap<(u32, u32), String>, usize) {
    let mut out = BTreeMap::new();
    let mut downgraded = 0usize;
    for thread in threads.iter().filter(|t| t.sheet == sheet) {
        let lines: Vec<String> = thread.thread.entries.iter()
            .filter(|entry| entry.kind == "message")
            .filter_map(|entry| entry.body.as_deref().map(|body| format!("{}: {body}", entry.author)))
            .collect();
        if !lines.is_empty() {
            downgraded += 1;
            out.insert((thread.row, thread.col), lines.join("\n"));
        }
    }
    // 备注优先于线程折叠出的文字。
    for note in notes.iter().filter(|n| n.sheet == sheet && !n.text.trim().is_empty()) {
        out.insert((note.row, note.col), note.text.clone());
    }
    (out, downgraded)
}

pub fn xml(comments: &BTreeMap<(u32, u32), String>) -> String {
    let items: String = comments.iter().map(|(&(row, col), text)| {
        format!(r#"<comment ref="{}" authorId="0"><text><r><t xml:space="preserve">{}</t></r></text></comment>"#,
            cell_name(row, col), escape(text))
    }).collect();
    format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>einfach</author></authors><commentList>{items}</commentList></comments>"#)
}
