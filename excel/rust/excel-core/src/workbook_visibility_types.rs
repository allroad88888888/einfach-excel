//! Workbook-owned hidden-row and filter snapshots.

use super::*;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SheetHiddenRows {
    pub sheet_index: usize,
    pub rows: Vec<u32>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HiddenRowsSnapshot {
    pub(super) sheets: Vec<SheetHiddenRows>,
}

impl HiddenRowsSnapshot {
    pub fn from_sheets(sheets: Vec<SheetHiddenRows>) -> Self {
        Self { sheets }
    }
    pub fn sheets(&self) -> &[SheetHiddenRows] {
        &self.sheets
    }
    pub fn len(&self) -> usize {
        self.sheets.len()
    }
    pub fn is_empty(&self) -> bool {
        self.sheets.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SheetFilterState {
    pub sheet_index: usize,
    pub rules: Vec<ColumnFilterRule>,
    pub hidden_rows: Vec<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FilterSnapshot {
    pub(super) sheets: Vec<SheetFilterState>,
}

impl FilterSnapshot {
    pub fn from_sheets(sheets: Vec<SheetFilterState>) -> Self {
        Self { sheets }
    }
    pub fn sheets(&self) -> &[SheetFilterState] {
        &self.sheets
    }
    pub(crate) fn into_sheets(self) -> Vec<SheetFilterState> {
        self.sheets
    }
    pub fn len(&self) -> usize {
        self.sheets.len()
    }
    pub fn is_empty(&self) -> bool {
        self.sheets.is_empty()
    }
}
