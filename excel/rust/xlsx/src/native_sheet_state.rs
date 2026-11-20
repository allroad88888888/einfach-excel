//! 原生文件里的工作表保护（`protection`）与行列分组大纲（`outlines`）结构。
//! 与 `excel/rust/wasm` 的持久化 JSON 逐字段对齐。

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAX_UNLOCKED_RANGES: usize = 256;
pub const MAX_OUTLINE_DEPTH: usize = 8;
pub const MAX_OUTLINE_GROUPS: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SheetProtectionEntry {
    pub sheet: u32,
    pub protection: SheetProtection,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionMode {
    #[default]
    Open,
    Protected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionRange {
    pub row_start: u32,
    pub row_end: u32,
    pub col_start: u32,
    pub col_end: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionPermissions {
    #[serde(default)]
    pub sort: bool,
    #[serde(default)]
    pub insert_rows: bool,
    #[serde(default)]
    pub insert_columns: bool,
    #[serde(default)]
    pub delete_rows: bool,
    #[serde(default)]
    pub delete_columns: bool,
}

impl ProtectionPermissions {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetProtection {
    #[serde(default)]
    pub mode: ProtectionMode,
    #[serde(default)]
    pub unlocked_ranges: Vec<ProtectionRange>,
    #[serde(default, skip_serializing_if = "ProtectionPermissions::is_default")]
    pub permissions: ProtectionPermissions,
}

impl SheetProtection {
    pub fn is_default(&self) -> bool {
        self.mode == ProtectionMode::Open
            && self.unlocked_ranges.is_empty()
            && self.permissions.is_default()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SheetOutlineEntry {
    pub sheet: usize,
    pub outline: SheetOutline,
    #[serde(default, rename = "subtotalRegions", skip_serializing_if = "Vec::is_empty")]
    pub subtotal_regions: Vec<Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SheetOutline {
    #[serde(default)]
    pub rows: Vec<OutlineGroup>,
    #[serde(default)]
    pub columns: Vec<OutlineGroup>,
}

impl SheetOutline {
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty() && self.columns.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutlineGroup {
    pub start: u32,
    pub end: u32,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtotal: Option<Value>,
}
