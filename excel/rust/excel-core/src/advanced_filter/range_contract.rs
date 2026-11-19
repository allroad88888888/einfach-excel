//! Native request and reports for advanced filtering by worksheet criteria.
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{CellAddress, CellRange, FilterError};

pub(crate) const MAX_RECORD_CELLS: u32 = 100_000;
pub(crate) const MAX_CRITERIA_CELLS: u32 = 1_024;
pub(crate) const MAX_CONDITION_EVALUATIONS: usize = 200_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FilterRangeRef {
    pub sheet: usize,
    pub range: CellRange,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AdvancedFilterSelection {
    pub source: FilterRangeRef,
    pub criteria: Option<FilterRangeRef>,
    pub unique_only: bool,
}

#[derive(Clone, Debug)]
pub struct AdvancedFilterCopy {
    pub selection: AdvancedFilterSelection,
    pub sheet: usize,
    pub destination: CellAddress,
    pub output_fields: Vec<String>,
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdvancedFilterCopyPreview {
    pub target: CellRange,
    pub matched_rows: usize,
    pub overwritten_cells: usize,
    pub sample: Vec<Vec<String>>,
    pub sample_truncated: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdvancedFilterCopyReport {
    pub target: CellRange,
    pub matched_rows: usize,
    pub changed_cells: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FilterOverwriteApproval {
    pub target: CellRange,
    pub count: usize,
}

pub(crate) fn validate_data_range(range: CellRange, limit: u32) -> Result<(), FilterError> {
    if range.start.row >= range.end.row
        || range.start.col > range.end.col
        || range.end.row >= EXCEL_MAX_ROWS
        || range.end.col >= EXCEL_MAX_COLS
    {
        return Err(FilterError::InvalidRange);
    }
    let cells = range.rows().saturating_mul(range.cols());
    if cells > limit {
        return Err(FilterError::InvalidCriteria(
            if limit == MAX_CRITERIA_CELLS {
                "Choose a criteria range with at most 1,024 cells."
            } else {
                "Choose a source with at most 100,000 cells."
            },
        ));
    }
    Ok(())
}
