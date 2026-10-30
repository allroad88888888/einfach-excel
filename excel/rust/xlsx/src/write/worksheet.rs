//! 单张工作表 → `sheetN.xml`：冻结窗格、列宽、按行排序的单元格、行高、合并区。

use std::collections::{BTreeMap, HashMap};

use crate::address::{cell_name, column_name};
use crate::formula;
use crate::native::{CellValue, SparseCell};
use crate::units::{px_to_column_width, px_to_row_height};

use super::xml::escape;

#[derive(Default)]
pub struct SheetInput<'a> {
    pub cells: Vec<&'a SparseCell>,
    /// (row, col) → cellXfs 下标
    pub styles: HashMap<(u32, u32), u32>,
    pub row_heights: BTreeMap<u32, u32>,
    pub col_widths: BTreeMap<u32, u32>,
    pub merges: Vec<[u32; 4]>,
    pub freeze: Option<(u32, u32)>,
}

/// 共享字符串表：同一文本只存一份。
#[derive(Default)]
pub struct SharedStrings {
    pub items: Vec<String>,
    index: HashMap<String, usize>,
}

impl SharedStrings {
    fn add(&mut self, text: &str) -> usize {
        if let Some(&index) = self.index.get(text) {
            return index;
        }
        self.items.push(text.to_string());
        self.index.insert(text.to_string(), self.items.len() - 1);
        self.items.len() - 1
    }
}

fn cell_xml(cell: Option<&SparseCell>, row: u32, col: u32, style: u32, strings: &mut SharedStrings) -> String {
    let r = cell_name(row, col);
    let s = if style == 0 { String::new() } else { format!(r#" s="{style}""#) };
    let Some(cell) = cell else { return format!(r#"<c r="{r}"{s}/>"#) };
    match (cell.kind.as_str(), &cell.value) {
        ("formula", Some(CellValue::Text(text))) => {
            format!(r#"<c r="{r}"{s}><f>{}</f></c>"#, escape(&formula::to_xlsx(text)))
        }
        ("number", Some(CellValue::Number(n))) if n.is_finite() => format!(r#"<c r="{r}"{s}><v>{n}</v></c>"#),
        ("boolean", Some(CellValue::Boolean(b))) => {
            format!(r#"<c r="{r}"{s} t="b"><v>{}</v></c>"#, u8::from(*b))
        }
        ("error", Some(CellValue::Text(text))) => format!(r#"<c r="{r}"{s} t="e"><v>{}</v></c>"#, escape(text)),
        (_, Some(CellValue::Text(text))) => {
            format!(r#"<c r="{r}"{s} t="s"><v>{}</v></c>"#, strings.add(text))
        }
        _ => format!(r#"<c r="{r}"{s}/>"#),
    }
}

fn sheet_view(freeze: Option<(u32, u32)>) -> String {
    let Some((rows, cols)) = freeze.filter(|(rows, cols)| *rows > 0 || *cols > 0) else {
        return r#"<sheetViews><sheetView workbookViewId="0"/></sheetViews>"#.into();
    };
    let pane = match (rows > 0, cols > 0) {
        (true, true) => "bottomRight",
        (true, false) => "bottomLeft",
        _ => "topRight",
    };
    let mut split = String::new();
    if cols > 0 {
        split.push_str(&format!(r#" xSplit="{cols}""#));
    }
    if rows > 0 {
        split.push_str(&format!(r#" ySplit="{rows}""#));
    }
    format!(r#"<sheetViews><sheetView workbookViewId="0"><pane{split} topLeftCell="{}" activePane="{pane}" state="frozen"/></sheetView></sheetViews>"#,
        cell_name(rows, cols))
}

pub fn write(sheet: &SheetInput, strings: &mut SharedStrings) -> String {
    let mut rows: BTreeMap<u32, BTreeMap<u32, (Option<&SparseCell>, u32)>> = BTreeMap::new();
    for cell in &sheet.cells {
        rows.entry(cell.row).or_default().insert(cell.col, (Some(*cell), 0));
    }
    for (&(row, col), &style) in &sheet.styles {
        rows.entry(row).or_default().entry(col).or_insert((None, 0)).1 = style;
    }
    for &row in sheet.row_heights.keys() {
        rows.entry(row).or_default();
    }

    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#);
    xml.push_str(&sheet_view(sheet.freeze));
    xml.push_str(r#"<sheetFormatPr defaultRowHeight="15"/>"#);
    if !sheet.col_widths.is_empty() {
        xml.push_str("<cols>");
        for (&col, &px) in &sheet.col_widths {
            let n = col + 1;
            xml.push_str(&format!(r#"<col min="{n}" max="{n}" width="{}" customWidth="1"/>"#, px_to_column_width(px)));
        }
        xml.push_str("</cols>");
    }
    xml.push_str("<sheetData>");
    for (row, cells) in rows {
        let height = sheet.row_heights.get(&row)
            .map(|&px| format!(r#" ht="{}" customHeight="1""#, px_to_row_height(px)))
            .unwrap_or_default();
        xml.push_str(&format!(r#"<row r="{}"{height}>"#, row + 1));
        for (col, (cell, style)) in cells {
            xml.push_str(&cell_xml(cell, row, col, style, strings));
        }
        xml.push_str("</row>");
    }
    xml.push_str("</sheetData>");
    if !sheet.merges.is_empty() {
        xml.push_str(&format!(r#"<mergeCells count="{}">"#, sheet.merges.len()));
        for [r1, c1, r2, c2] in &sheet.merges {
            xml.push_str(&format!(r#"<mergeCell ref="{}{}:{}{}"/>"#,
                column_name(*c1), r1 + 1, column_name(*c2), r2 + 1));
        }
        xml.push_str("</mergeCells>");
    }
    xml.push_str("</worksheet>");
    xml
}
