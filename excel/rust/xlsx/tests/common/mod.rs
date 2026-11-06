//! 图表导出测试共用：拼原生 JSON、导出、读 zip 里的部件。
//! （误覆盖后按测试用法重建的版本；导出侧负责人如有原件请直接替换。）
#![allow(dead_code)]

use std::io::Read;

use serde_json::{json, Value};

pub fn anchor() -> Value {
    json!({"row": 1, "col": 3, "offsetX": 10, "offsetY": 5, "width": 480, "height": 288})
}

pub fn range(start_row: u32, start_col: u32, end_row: u32, end_col: u32, sheet: Option<&str>) -> Value {
    let mut range = json!({"startRow": start_row, "startCol": start_col, "endRow": end_row, "endCol": end_col});
    if let Some(sheet) = sheet {
        range["sheetName"] = json!(sheet);
    }
    range
}

pub fn chart(id: &str, refs: Value, payload: Value) -> Value {
    json!({"id": id, "kind": "chart", "anchor": anchor(), "refs": refs, "payload": payload})
}

/// 两张表（Main、My Data）；`drawings` 放在第 0 张表，`extra` 的键并入 `workbook`。
pub fn native(drawings: Vec<Value>, extra: Value) -> String {
    let mut workbook = json!({
        "version": 1,
        "sheets": [{"idx": 0, "name": "Main"}, {"idx": 1, "name": "My Data"}],
        "cells": [{"sheet": 1, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Region"}],
        "drawings": [{"sheet": 0, "drawings": drawings}],
    });
    for (key, value) in extra.as_object().into_iter().flatten() {
        workbook[key] = value.clone();
    }
    json!({
        "format": "einfach-workbook", "version": 1, "title": "Charts",
        "canvases": [{"rowCount": 100, "colCount": 20}, {"rowCount": 100, "colCount": 20}],
        "workbook": workbook,
    }).to_string()
}

pub struct Exported {
    pub bytes: Vec<u8>,
    pub report: einfach_xlsx::ConversionReport,
}

pub fn export(json: &str) -> Exported {
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(json).expect("exports");
    Exported { bytes, report }
}

impl Exported {
    pub fn has_part(&self, name: &str) -> bool {
        zip::ZipArchive::new(std::io::Cursor::new(&self.bytes)).unwrap().by_name(name).is_ok()
    }

    pub fn part(&self, name: &str) -> String {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&self.bytes)).unwrap();
        let mut file = archive.by_name(name).unwrap_or_else(|_| panic!("missing part {name}"));
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();
        text
    }

    pub fn report_kinds(&self) -> Vec<(String, usize)> {
        self.report.items.iter().map(|item| (item.kind.clone(), item.count)).collect()
    }
}
