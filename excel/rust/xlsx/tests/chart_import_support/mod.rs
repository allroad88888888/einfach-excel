//! 图表导入测试共用：读 charts.xlsx、按表和对象 id 取图表。
#![allow(dead_code)]

use serde_json::Value;

pub struct Imported {
    pub file: Value,
    pub report: einfach_xlsx::ConversionReport,
}

pub fn import(path: &str) -> Imported {
    let bytes = std::fs::read(path).expect("fixture exists");
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Book").expect("converts");
    Imported { file: serde_json::from_str(&text).unwrap(), report }
}

impl Imported {
    /// 某张表（下标）的全部对象；没有就是空。
    pub fn drawings(&self, sheet: usize) -> Vec<&Value> {
        self.file["workbook"]["drawings"].as_array().into_iter().flatten()
            .filter(|entry| entry["sheet"] == sheet)
            .flat_map(|entry| entry["drawings"].as_array().unwrap()).collect()
    }

    pub fn chart(&self, sheet: usize, id: &str) -> &Value {
        self.drawings(sheet).into_iter().find(|drawing| drawing["id"] == id)
            .unwrap_or_else(|| panic!("no object {id} on sheet {sheet}"))
    }

    pub fn report_items(&self) -> Vec<(&str, usize)> {
        self.report.items.iter().map(|item| (item.kind.as_str(), item.count)).collect()
    }
}

/// `[startRow, startCol, endRow, endCol, sheetName]`，方便整组比较。
pub fn refs(drawing: &Value) -> Vec<(u64, u64, u64, u64, Option<String>)> {
    drawing["refs"].as_array().unwrap().iter().map(|range| (
        range["startRow"].as_u64().unwrap(),
        range["startCol"].as_u64().unwrap(),
        range["endRow"].as_u64().unwrap(),
        range["endCol"].as_u64().unwrap(),
        range["sheetName"].as_str().map(str::to_string),
    )).collect()
}

/// `(row, col, offsetX, offsetY, width, height)`
pub fn anchor(drawing: &Value) -> (u64, u64, u64, u64, u64, u64) {
    let a = &drawing["anchor"];
    let n = |key: &str| a[key].as_u64().unwrap();
    (n("row"), n("col"), n("offsetX"), n("offsetY"), n("width"), n("height"))
}
