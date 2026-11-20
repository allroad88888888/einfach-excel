//! 单张工作表 → `sheetN.xml`：工作表属性、冻结窗格、列宽/隐藏列/列大纲、单元格与行大纲、工作表保护、合并区。

use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::address::{cell_name, column_name};
use crate::color::to_argb;
use crate::formula;
use crate::native::{CellValue, SparseCell};
use crate::units::{px_to_column_width, px_to_row_height};

use super::xml::escape;

#[derive(Default)]
pub struct SheetInput<'a> {
    pub cells: Vec<&'a SparseCell>,
    pub rich_text: HashMap<(u32, u32), &'a [crate::native_rich_text::RichTextRun]>,
    pub defaults: crate::sheet_defaults::SheetDefaults,
    pub default_style: u32,
    pub tab_color: Option<String>,
    /// (row, col) → cellXfs 下标
    pub styles: HashMap<(u32, u32), u32>,
    pub row_styles: BTreeMap<u32, u32>,
    pub column_styles: BTreeMap<u32, u32>,
    pub row_heights: BTreeMap<u32, u32>,
    pub col_widths: BTreeMap<u32, u32>,
    pub merges: Vec<[u32; 4]>,
    pub freeze: Option<(u32, u32)>,
    pub hide_gridlines: bool,
    pub hide_headings: bool,
    pub hidden_rows: BTreeSet<u32>,
    pub hidden_cols: BTreeSet<u32>,
    pub outline: super::outline::SheetOutlinePlan,
    /// `</sheetData>` 之后、`mergeCells` 之前的保护片段（`sheetProtection` + `protectedRanges`）。
    pub protection_xml: String,
    /// `mergeCells` 之后的片段（条件格式、数据验证、超链接、批注与表引用），顺序须符合 schema。
    pub tail: String,
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

fn cell_xml(
    cell: Option<&SparseCell>,
    row: u32,
    col: u32,
    style: u32,
    default_style: u32,
    strings: &mut SharedStrings,
    runs: Option<&[crate::native_rich_text::RichTextRun]>,
) -> String {
    let r = cell_name(row, col);
    // Explicit style 0 must override a nonzero column default as well.
    let s = if style == 0 && default_style == 0 { String::new() } else { format!(r#" s="{style}""#) };
    let Some(cell) = cell else { return format!(r#"<c r="{r}"{s}/>"#) };
    match (cell.kind.as_str(), &cell.value) {
        ("formula", Some(CellValue::Text(text))) => {
            format!(r#"<c r="{r}"{s}><f>{}</f></c>"#, escape(&formula::to_xlsx(text)))
        }
        ("number", Some(CellValue::Number(n))) if n.is_finite() => format!(r#"<c r="{r}"{s}><v>{n}</v></c>"#),
        ("boolean", Some(CellValue::Boolean(b))) => format!(r#"<c r="{r}"{s} t="b"><v>{}</v></c>"#, u8::from(*b)),
        ("error", Some(CellValue::Text(text))) => format!(r#"<c r="{r}"{s} t="e"><v>{}</v></c>"#, escape(text)),
        (_, Some(CellValue::Text(text))) => {
            if let Some(runs) = runs.filter(|runs| !runs.is_empty() && runs.iter().map(|r| r.text.as_str()).collect::<String>() == *text) {
                return format!(r#"<c r="{r}"{s} t="inlineStr">{}</c>"#, super::rich_text::xml(runs));
            }
            format!(r#"<c r="{r}"{s} t="s"><v>{}</v></c>"#, strings.add(text))
        }
        _ => format!(r#"<c r="{r}"{s}/>"#),
    }
}

fn sheet_pr(sheet: &SheetInput) -> String {
    let tab_color = sheet.tab_color.as_deref().and_then(to_argb)
        .map(|argb| format!(r#"<tabColor rgb="{argb}"/>"#)).unwrap_or_default();
    let outline_pr = if !sheet.outline.rows.summary_after || !sheet.outline.cols.summary_after {
        let b = if !sheet.outline.rows.summary_after { r#" summaryBelow="0""# } else { "" };
        let r = if !sheet.outline.cols.summary_after { r#" summaryRight="0""# } else { "" };
        format!("<outlinePr{b}{r}/>")
    } else {
        String::new()
    };
    if tab_color.is_empty() && outline_pr.is_empty() {
        String::new()
    } else {
        format!("<sheetPr>{tab_color}{outline_pr}</sheetPr>")
    }
}

fn sheet_view(sheet: &SheetInput) -> String {
    let mut view = String::new();
    if sheet.hide_gridlines { view.push_str(r#" showGridLines="0""#); }
    if sheet.hide_headings { view.push_str(r#" showRowColHeaders="0""#); }
    let Some((rows, cols)) = sheet.freeze.filter(|(rows, cols)| *rows > 0 || *cols > 0) else {
        return format!(r#"<sheetViews><sheetView{view} workbookViewId="0"/></sheetViews>"#);
    };
    let pane = match (rows > 0, cols > 0) {
        (true, true) => "bottomRight",
        (true, false) => "bottomLeft",
        _ => "topRight",
    };
    let mut split = String::new();
    if cols > 0 { split.push_str(&format!(r#" xSplit="{cols}""#)); }
    if rows > 0 { split.push_str(&format!(r#" ySplit="{rows}""#)); }
    format!(
        r#"<sheetViews><sheetView{view} workbookViewId="0"><pane{split} topLeftCell="{}" activePane="{pane}" state="frozen"/></sheetView></sheetViews>"#,
        cell_name(rows, cols)
    )
}

fn cols_xml(sheet: &SheetInput) -> String {
    let columns: BTreeSet<u32> = sheet.col_widths.keys().chain(&sheet.hidden_cols)
        .chain(sheet.column_styles.keys()).copied().chain(sheet.outline.cols.touched_indices()).collect();
    if columns.is_empty() && sheet.defaults.font_size.is_none() {
        return String::new();
    }
    let mut xml = String::from("<cols>");
    let mut next = 1u32;
    let style = sheet.defaults.font_size.map(|_| format!(r#" style="{}""#, sheet.default_style)).unwrap_or_default();
    let col_attrs = |col: u32| -> String {
        let width = sheet.col_widths.get(&col)
            .map(|&px| format!(r#" width="{}" customWidth="1""#, px_to_column_width(px))).unwrap_or_default();
        let hidden = if sheet.hidden_cols.contains(&col) || sheet.outline.cols.hidden.contains(&col) { r#" hidden="1""# } else { "" };
        let column_style = sheet.column_styles.get(&col).map(|xf| format!(r#" style="{xf}""#)).unwrap_or_else(|| style.clone());
        let outline = sheet.outline.cols.levels.get(&col).filter(|&&l| l > 0)
            .map(|l| format!(r#" outlineLevel="{l}""#)).unwrap_or_default();
        let collapsed = if sheet.outline.cols.collapsed_markers.contains(&col) { r#" collapsed="1""# } else { "" };
        format!("{width}{hidden}{column_style}{outline}{collapsed}")
    };
    let mut pending: Option<(u32, u32, String)> = None;
    for col in columns {
        let n = col + 1;
        let attrs = col_attrs(col);
        match pending.take() {
            Some((s_min, s_max, prev_attrs)) if n == s_max + 1 && prev_attrs == attrs => {
                pending = Some((s_min, n, prev_attrs));
            }
            Some((s_min, s_max, prev_attrs)) => {
                xml.push_str(&format!(r#"<col min="{s_min}" max="{s_max}"{prev_attrs}/>"#));
                next = s_max + 1;
                if next < n && !style.is_empty() {
                    xml.push_str(&format!(r#"<col min="{next}" max="{}"{style}/>"#, n - 1));
                }
                pending = Some((n, n, attrs));
            }
            None => {
                if next < n && !style.is_empty() {
                    xml.push_str(&format!(r#"<col min="{next}" max="{}"{style}/>"#, n - 1));
                }
                pending = Some((n, n, attrs));
            }
        }
    }
    if let Some((s_min, s_max, prev_attrs)) = pending {
        xml.push_str(&format!(r#"<col min="{s_min}" max="{s_max}"{prev_attrs}/>"#));
        next = s_max + 1;
    }
    if next <= 16_384 && !style.is_empty() {
        xml.push_str(&format!(r#"<col min="{next}" max="16384"{style}/>"#));
    }
    xml.push_str("</cols>");
    xml
}

pub fn write(sheet: &SheetInput, strings: &mut SharedStrings) -> String {
    let mut rows: BTreeMap<u32, BTreeMap<u32, (Option<&SparseCell>, u32)>> = BTreeMap::new();
    for cell in &sheet.cells {
        rows.entry(cell.row).or_default().insert(cell.col, (Some(*cell), sheet.default_style));
    }
    for (&(row, col), &style) in &sheet.styles {
        rows.entry(row).or_default().entry(col).or_insert((None, 0)).1 = style;
    }
    for row in sheet.row_heights.keys().chain(&sheet.hidden_rows)
        .chain(sheet.row_styles.keys()).copied().chain(sheet.outline.rows.touched_indices())
    {
        rows.entry(row).or_default();
    }

    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">"#,
    );
    xml.push_str(&sheet_pr(sheet));
    xml.push_str(&sheet_view(sheet));
    let default_width = sheet.defaults.col_width
        .map(|px| format!(r#" defaultColWidth="{}""#, px_to_column_width(px))).unwrap_or_default();
    xml.push_str(&format!(
        r#"<sheetFormatPr defaultRowHeight="{}"{default_width}/>"#,
        px_to_row_height(sheet.defaults.row_height.unwrap_or(28))
    ));
    xml.push_str(&cols_xml(sheet));
    xml.push_str("<sheetData>");
    for (row, cells) in rows {
        let height = sheet.row_heights.get(&row)
            .map(|&px| format!(r#" ht="{}" customHeight="1""#, px_to_row_height(px))).unwrap_or_default();
        let hidden = if sheet.hidden_rows.contains(&row) || sheet.outline.rows.hidden.contains(&row) { r#" hidden="1""# } else { "" };
        let row_style = sheet.row_styles.get(&row)
            .map(|xf| format!(r#" s="{xf}" customFormat="1""#)).unwrap_or_default();
        let outline = sheet.outline.rows.levels.get(&row).filter(|&&l| l > 0)
            .map(|l| format!(r#" outlineLevel="{l}""#)).unwrap_or_default();
        let collapsed = if sheet.outline.rows.collapsed_markers.contains(&row) { r#" collapsed="1""# } else { "" };
        xml.push_str(&format!(r#"<row r="{}"{height}{hidden}{row_style}{outline}{collapsed}>"#, row + 1));
        for (col, (cell, style)) in cells {
            xml.push_str(&cell_xml(
                cell, row, col, style, sheet.default_style, strings,
                sheet.rich_text.get(&(row, col)).copied(),
            ));
        }
        xml.push_str("</row>");
    }
    xml.push_str("</sheetData>");
    xml.push_str(&sheet.protection_xml);
    if !sheet.merges.is_empty() {
        xml.push_str(&format!(r#"<mergeCells count="{}">"#, sheet.merges.len()));
        for [r1, c1, r2, c2] in &sheet.merges {
            xml.push_str(&format!(r#"<mergeCell ref="{}{}:{}{}"/>"#, column_name(*c1), r1 + 1, column_name(*c2), r2 + 1));
        }
        xml.push_str("</mergeCells>");
    }
    xml.push_str(&sheet.tail);
    xml.push_str("</worksheet>");
    xml
}
