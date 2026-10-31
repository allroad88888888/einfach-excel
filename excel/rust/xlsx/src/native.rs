//! 原生工作簿文件（`.einfach.json`，format `einfach-workbook` v1）里本 crate 读写的子集。
//! 未列出的字段（保护、筛选、打印等）导入时缺省，导出时忽略；完整校验仍由引擎 restore 负责。

use serde::{Deserialize, Serialize};

pub use crate::native_features::*;
pub use crate::native_rules::*;

pub const FORMAT: &str = "einfach-workbook";
pub const MAX_ROWS: u32 = 1_048_576;
pub const MAX_COLS: u32 = 16_384;

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeFile {
    pub format: String,
    pub version: u32,
    pub title: String,
    pub canvases: Vec<Canvas>,
    pub workbook: Persistence,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Canvas {
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Persistence {
    pub version: u32,
    pub sheets: Vec<SheetMeta>,
    pub cells: Vec<SparseCell>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub merges: Vec<SheetMerges>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub freeze: Vec<SheetFreeze>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub formats: Vec<FormatRange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sizes: Vec<SizeRange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hyperlinks: Vec<Hyperlink>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<Note>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub comments: Vec<CommentThread>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tables: Vec<Table>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hidden: Vec<SheetHiddenRows>,
    #[serde(default, rename = "hiddenColumns", skip_serializing_if = "Vec::is_empty")]
    pub hidden_columns: Vec<SheetHiddenColumns>,
    #[serde(default, rename = "conditionalFormats", skip_serializing_if = "Vec::is_empty")]
    pub conditional_formats: Vec<SheetConditional>,
    #[serde(default, rename = "dataValidations", skip_serializing_if = "Vec::is_empty")]
    pub data_validations: Vec<SheetValidation>,
    #[serde(default, rename = "namedRanges", skip_serializing_if = "Vec::is_empty")]
    pub named_ranges: Vec<NamedRange>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetMeta {
    pub idx: u32,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CellValue {
    Number(f64),
    Boolean(bool),
    Text(String),
}

/// `kind`：number / text / boolean / error / formula（公式带前导 `=`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SparseCell {
    pub sheet: usize,
    pub addr: String,
    pub row: u32,
    pub col: u32,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<CellValue>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetMerges {
    pub sheet: usize,
    /// `[startRow, startCol, endRow, endCol]`
    pub ranges: Vec<[u32; 4]>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetFreeze {
    pub sheet: usize,
    pub rows: u32,
    pub cols: u32,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatRange {
    #[serde(default)]
    pub sheet: Option<u32>,
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
    #[serde(default, alias = "cellFormats")]
    pub cell_styles: Vec<CellStyle>,
    #[serde(default)]
    pub row_styles: Vec<IndexedStyle>,
    #[serde(default)]
    pub column_styles: Vec<IndexedStyle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CellStyle {
    pub addr: String,
    pub format: CellFormat,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexedStyle {
    pub index: u32,
    pub format: CellFormat,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellFormat {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub number_format: Option<NumberFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    /// `#rrggbb`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fg_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg_color: Option<String>,
    /// left / center / right
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<String>,
    /// top / center / bottom / justify / distributed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indent: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub borders: Option<Borders>,
}

/// kind：general / text / number / percent / currency / scientific / fraction / date / time / custom
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct NumberFormat {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub digits: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thousands: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub denominator: Option<serde_json::Value>,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
pub struct Borders {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top: Option<BorderSide>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<BorderSide>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bottom: Option<BorderSide>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<BorderSide>,
}

/// style：none / thin / medium / thick / dashed / dotted / double
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BorderSide {
    pub style: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeRange {
    #[serde(default)]
    pub sheet: Option<u32>,
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub row_heights: Vec<RowHeight>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub col_widths: Vec<ColWidth>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowHeight {
    pub row_index: u32,
    pub height_px: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColWidth {
    pub col_index: u32,
    pub width_px: u32,
}
