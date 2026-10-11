//! Excel Table registry value objects and snapshots.

use super::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableEntry {
    pub(super) canonical_name: String,
    pub(super) sheet_name: String,
    pub(super) range: CellRange,
    pub(super) has_headers: bool,
    pub(super) has_totals: bool,
    // 空表的待输入行占位置，但不是一条已存在的空白数据记录。
    pub(super) insert_row: bool,
    pub(super) columns: Vec<String>,
    pub(super) style: crate::TableStyle,
    // 空列表表示没有计算列；非空时按 columns 对齐，None 是普通数据列。
    pub(super) calculated_columns: Vec<Option<crate::TableColumnFormula>>,
}

impl TableEntry {
    pub fn from_parts(
        canonical_name: impl Into<String>,
        sheet_name: impl Into<String>,
        range: CellRange,
        has_headers: bool,
        has_totals: bool,
        columns: Vec<String>,
    ) -> Self {
        TableEntry {
            canonical_name: canonical_name.into(),
            sheet_name: sheet_name.into(),
            range: range.normalize(),
            has_headers,
            has_totals,
            insert_row: false,
            columns,
            style: crate::TableStyle::default(),
            calculated_columns: Vec::new(),
        }
    }

    pub fn name(&self) -> &str {
        &self.canonical_name
    }
    pub fn sheet_name(&self) -> &str {
        &self.sheet_name
    }
    pub fn range(&self) -> CellRange {
        self.range
    }
    pub fn has_headers(&self) -> bool {
        self.has_headers
    }
    pub fn has_totals(&self) -> bool {
        self.has_totals
    }
    pub fn has_insert_row(&self) -> bool { self.insert_row }

    /// 几何合法性由注册表原子校验；不能靠格子恰好为空推断是否存在数据记录。
    pub fn with_insert_row(mut self, enabled: bool) -> Self {
        self.insert_row = enabled;
        self
    }
    pub fn columns(&self) -> &[String] {
        &self.columns
    }

    pub fn style(&self) -> crate::TableStyle { self.style }

    pub fn with_style(mut self, style: crate::TableStyle) -> Self {
        self.style = style;
        self
    }

    pub fn calculated_columns(&self) -> &[Option<crate::TableColumnFormula>] {
        &self.calculated_columns
    }

    /// 恢复时由注册表检查长度，不在这里静默丢掉错误的列映射。
    pub fn with_calculated_columns(mut self, columns: Vec<Option<crate::TableColumnFormula>>) -> Self {
        self.calculated_columns = columns;
        self
    }

    pub(super) fn same_formula_definition(&self, other: &Self) -> bool {
        self.canonical_name == other.canonical_name && self.sheet_name == other.sheet_name
            && self.range == other.range && self.has_headers == other.has_headers
            && self.has_totals == other.has_totals && self.insert_row == other.insert_row
            && self.columns == other.columns
    }

    pub(crate) fn to_resolved(&self, sheet_index: usize) -> ResolvedTable {
        ResolvedTable {
            sheet_name: self.sheet_name.clone(),
            sheet_index,
            range: self.range,
            has_headers: self.has_headers,
            has_totals: self.has_totals,
            insert_row: self.insert_row,
            columns: self.columns.clone(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TableRegistrySnapshot {
    pub(super) entries: Vec<TableEntry>,
}

impl TableRegistrySnapshot {
    pub fn from_entries(entries: Vec<TableEntry>) -> Self {
        Self { entries }
    }
    pub fn entries(&self) -> &[TableEntry] {
        &self.entries
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}
