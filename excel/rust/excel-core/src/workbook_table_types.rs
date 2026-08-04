//! Excel Table registry value objects and snapshots.

use super::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableEntry {
    pub(super) canonical_name: String,
    pub(super) sheet_name: String,
    pub(super) range: CellRange,
    pub(super) has_headers: bool,
    pub(super) has_totals: bool,
    pub(super) columns: Vec<String>,
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
            columns,
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
    pub fn columns(&self) -> &[String] {
        &self.columns
    }

    pub(crate) fn to_resolved(&self, sheet_index: usize) -> ResolvedTable {
        ResolvedTable {
            sheet_name: self.sheet_name.clone(),
            sheet_index,
            range: self.range,
            has_headers: self.has_headers,
            has_totals: self.has_totals,
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
