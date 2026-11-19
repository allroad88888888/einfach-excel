//! Workbook-owned hidden-row and filter snapshots.

use super::*;

/// 手动可见性的原生快照；筛选派生隐藏状态单独持有，不被“取消隐藏”清除。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SheetVisibility {
    pub rows: Vec<u32>,
    pub columns: Vec<u32>,
}

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
    pub range: Option<CellRange>,
    pub rules: Vec<ColumnFilterRule>,
    pub groups: Vec<crate::advanced_filter::ColumnFilterGroup>,
    pub hidden_rows: Vec<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FilterSnapshot {
    pub(super) sheets: Vec<SheetFilterState>,
    range_criteria: std::collections::BTreeMap<usize, crate::advanced_filter::PersistedFilterCriteria>,
}

impl FilterSnapshot {
    pub fn from_sheets(sheets: Vec<SheetFilterState>) -> Self {
        Self { sheets, ..Self::default() }
    }
    pub fn with_range_criteria(mut self,
        criteria: impl IntoIterator<Item = (usize, crate::advanced_filter::PersistedFilterCriteria)>,
    ) -> Self {
        self.range_criteria.extend(criteria);
        self
    }
    pub fn range_criteria(&self, sheet: usize) -> Option<crate::advanced_filter::PersistedFilterCriteria> {
        self.range_criteria.get(&sheet).copied()
    }
    pub fn sheets(&self) -> &[SheetFilterState] {
        &self.sheets
    }
    pub fn len(&self) -> usize {
        self.sheets.len()
    }
    pub fn is_empty(&self) -> bool {
        self.sheets.is_empty()
    }
}
