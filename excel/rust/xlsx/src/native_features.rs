//! 原生文件里"挂在单元格/工作表上的功能"字段：超链接、批注、可见性、命名区域、Table。
//! 字段名与 `excel/rust/wasm/src` 的 *JSON 结构逐一对应（由真实快照核对），不是猜的。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Hyperlink {
    pub sheet: usize,
    pub row: u32,
    pub col: u32,
    pub url: String,
}

/// 旧式批注（XLSX 的 comments 部件）对应的原生备注。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub sheet: usize,
    pub row: u32,
    pub col: u32,
    pub text: String,
}

/// 原生线程批注；本 crate 只读取，导出时折成备注文字。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub sheet: usize,
    pub row: u32,
    pub col: u32,
    pub thread: Thread,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thread {
    pub entries: Vec<ThreadEntry>,
    #[serde(default)]
    pub resolved: bool,
}

/// kind：message / resolve / reopen
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadEntry {
    pub kind: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetHiddenRows {
    pub sheet: u32,
    pub rows: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetHiddenColumns {
    pub sheet: usize,
    pub columns: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NamedRange {
    pub name: String,
    pub target: Option<NamedRangeTarget>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NamedRangeTarget {
    pub sheet: usize,
    /// `[startRow, startCol, endRow, endCol]`
    pub range: [u32; 4],
}

/// preset：none / blue / green / gray
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableStyle {
    pub preset: String,
    pub banded_rows: bool,
    pub first_column: bool,
    #[serde(default)]
    pub banded_columns: bool,
    #[serde(default)]
    pub last_column: bool,
}

impl Default for TableStyle {
    fn default() -> Self {
        Self { preset: "none".into(), banded_rows: true, first_column: false, banded_columns: false, last_column: false }
    }
}

/// `range` 是 `A1:C10` 形式，含表头行与汇总行；`columns` 与表头单元格文本一致。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub name: String,
    pub sheet: String,
    #[serde(default)]
    pub sheet_index: u32,
    pub range: String,
    #[serde(default)]
    pub has_headers: bool,
    #[serde(default)]
    pub has_totals: bool,
    #[serde(default)]
    pub columns: Vec<String>,
    #[serde(default)]
    pub style: TableStyle,
}
