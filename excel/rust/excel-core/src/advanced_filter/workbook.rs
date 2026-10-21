use super::{validate_groups, ColumnFilterGroup, FilterCriteria};
use crate::{CellRange, FilterApplyReport, FilterError, Workbook};
use crate::workbook_history::WorkbookHistory;

impl Workbook {
    pub fn apply_filter_groups(&mut self, sheet: usize, groups: &[ColumnFilterGroup])
        -> Result<FilterApplyReport, FilterError> {
        validate_groups(groups)?;
        self.run_filter_criteria(sheet, FilterCriteria::Groups(groups))
    }

    pub fn apply_filter_range_groups(&mut self, sheet: usize, range: CellRange,
        groups: &[ColumnFilterGroup]) -> Result<FilterApplyReport, FilterError> {
        validate_groups(groups)?;
        self.apply_filter_range_criteria(sheet, range, FilterCriteria::Groups(groups))
    }
}

impl WorkbookHistory {
    pub fn apply_filter_groups(&mut self, workbook: &mut Workbook, sheet: usize,
        groups: &[ColumnFilterGroup]) -> Result<FilterApplyReport, FilterError> {
        self.change_filter(workbook, sheet, "Apply advanced filter", |book|
            book.apply_filter_groups(sheet, groups))
    }

    pub fn apply_filter_range_groups(&mut self, workbook: &mut Workbook, sheet: usize,
        range: CellRange, groups: &[ColumnFilterGroup]) -> Result<FilterApplyReport, FilterError> {
        self.change_filter(workbook, sheet, "Filter selected range", |book|
            book.apply_filter_range_groups(sheet, range, groups))
    }
}
