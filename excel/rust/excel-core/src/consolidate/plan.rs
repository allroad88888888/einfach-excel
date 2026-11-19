//! Validate consolidation inputs and build the execution/preview plan.
use super::aggregate::ConsolidateFunction;
use super::layout::build_layout;
use crate::outline::{OutlineGroup, MAX_OUTLINE_GROUPS};
use crate::sheet::{collapse_array_for_eval, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{CellAddress, CellRange, CellSnapshot, Workbook};
use einfach_core::Value;

pub const MAX_CONSOLIDATE_SOURCES: usize = 32;
pub const MAX_CONSOLIDATE_CELLS: u32 = 100_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConsolidateSource {
    pub sheet: usize,
    pub range: CellRange,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsolidateRequest {
    pub function: ConsolidateFunction,
    pub sources: Vec<ConsolidateSource>,
    pub sheet: usize,
    pub destination: CellAddress,
    pub top_row: bool,
    pub left_column: bool,
    pub create_links: bool,
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConsolidateOverwriteApproval {
    pub target: CellRange,
    pub count: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsolidatePreview {
    pub target: CellRange,
    pub row_count: u32,
    pub col_count: u32,
    pub overwritten_cells: usize,
    pub sample: Vec<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConsolidateReport {
    pub target: CellRange,
    pub changed_cells: usize,
    pub linked_groups: usize,
}

pub(super) struct ConsolidatePlan {
    pub(super) target: CellRange,
    pub(super) overwritten_cells: usize,
    pub(super) cells: Vec<CellSnapshot>,
    pub(super) outline_groups: Vec<OutlineGroup>,
    pub(super) sample: Vec<Vec<String>>,
}

pub(super) struct SourceGrid {
    pub(super) sheet_name: String,
    pub(super) origin: CellAddress,
    pub(super) rows: usize,
    pub(super) cols: usize,
    pub(super) values: Vec<Value>,
}

impl SourceGrid {
    pub(super) fn get(&self, r: usize, c: usize) -> &Value {
        &self.values[r * self.cols + c]
    }
    pub(super) fn addr(&self, r: usize, c: usize) -> CellAddress {
        CellAddress::new(self.origin.row + r as u32, self.origin.col + c as u32)
    }
}

impl Workbook {
    pub fn preview_consolidate(
        &self,
        request: &ConsolidateRequest,
    ) -> Result<ConsolidatePreview, &'static str> {
        let plan = self.plan_consolidate(request)?;
        Ok(ConsolidatePreview {
            target: plan.target,
            row_count: plan.target.rows(),
            col_count: plan.target.cols(),
            overwritten_cells: plan.overwritten_cells,
            sample: plan.sample,
        })
    }

    pub(super) fn plan_consolidate(
        &self,
        request: &ConsolidateRequest,
    ) -> Result<ConsolidatePlan, &'static str> {
        if request.sources.is_empty() || request.sources.len() > MAX_CONSOLIDATE_SOURCES {
            return Err("Add between 1 and 32 source ranges to consolidate.");
        }
        let dest_sheet = self
            .sheet(request.sheet)
            .ok_or("The worksheet no longer exists.")?;
        if request.row_count == 0
            || request.row_count > EXCEL_MAX_ROWS
            || request.col_count == 0
            || request.col_count > EXCEL_MAX_COLS
            || request.destination.row >= request.row_count
            || request.destination.col >= request.col_count
        {
            return Err("Choose a destination cell within the worksheet.");
        }
        let mut grids = Vec::with_capacity(request.sources.len());
        for source in &request.sources {
            let range = source.range.normalize();
            let _sheet = self
                .sheet(source.sheet)
                .ok_or("One of the source worksheets no longer exists.")?;
            let sheet_name = self
                .name(source.sheet)
                .ok_or("One of the source worksheets no longer exists.")?
                .to_owned();
            if request.create_links && source.sheet == request.sheet {
                return Err(
                    "Create links to source data requires sources on other worksheets.",
                );
            }
            if range.end.row >= EXCEL_MAX_ROWS
                || range.end.col >= EXCEL_MAX_COLS
                || range.cell_count() > MAX_CONSOLIDATE_CELLS
            {
                return Err("Choose source ranges of at most 100,000 cells each.");
            }
            if request.top_row && range.rows() < 2 {
                return Err("Each source needs a top label row and at least one data row.");
            }
            if request.left_column && range.cols() < 2 {
                return Err("Each source needs a left label column and at least one data column.");
            }
            let rows = range.rows() as usize;
            let cols = range.cols() as usize;
            let mut values = vec![Value::Null; rows * cols];
            self.for_each_sparse_range_cell(source.sheet, range, |addr, value| {
                let r = (addr.row - range.start.row) as usize;
                let c = (addr.col - range.start.col) as usize;
                values[r * cols + c] = collapse_array_for_eval(value);
            });
            grids.push(SourceGrid {
                sheet_name,
                origin: range.start,
                rows,
                cols,
                values,
            });
        }

        let (out_rows, out_cols, cells, outline_groups, sample) = build_layout(request, &grids)?;
        if out_rows == 0 || out_cols == 0 {
            return Err("No matching labels or data cells were found in the source ranges.");
        }
        let end_row = request
            .destination
            .row
            .checked_add(out_rows - 1)
            .filter(|&r| r < request.row_count)
            .ok_or("The consolidated output exceeds the worksheet row limit.")?;
        let end_col = request
            .destination
            .col
            .checked_add(out_cols - 1)
            .filter(|&c| c < request.col_count)
            .ok_or("The consolidated output exceeds the worksheet column limit.")?;
        let target = CellRange::new(request.destination, CellAddress::new(end_row, end_col));
        if target.cell_count() > MAX_CONSOLIDATE_CELLS {
            return Err("The consolidated output exceeds the 100,000-cell limit.");
        }
        self.ensure_range_editable(request.sheet, target)
            .map_err(|_| crate::protection::PROTECTED_ERROR)?;
        if self.list_tables().into_iter().any(|table| {
            Some(table.sheet_name()) == self.name(request.sheet) && table.range().intersects(target)
        }) {
            return Err("Choose a destination outside existing Tables.");
        }
        if dest_sheet
            .merged_ranges()
            .iter()
            .any(|merged| merged.intersects(target))
            || dest_sheet.spill_intersecting(target).is_some()
        {
            return Err("Choose a destination without merged cells or spilled formulas.");
        }
        if dest_sheet
            .filter()
            .and_then(|f| f.range())
            .is_some_and(|range| range.intersects(target))
        {
            return Err("Choose a destination outside an active filter range.");
        }
        if dest_sheet
            .subtotal_regions
            .iter()
            .any(|region| region.output().intersects(target))
        {
            return Err("Choose a destination outside an existing subtotal list.");
        }
        if !outline_groups.is_empty() {
            let existing = &dest_sheet.outline().rows;
            if existing.len() + outline_groups.len() > MAX_OUTLINE_GROUPS {
                return Err("The consolidated links exceed the worksheet outline limit.");
            }
            for group in &outline_groups {
                if existing.iter().any(|old| old.start <= group.end && group.start <= old.end) {
                    return Err("Clear overlapping row outline groups at the destination first.");
                }
            }
        }
        let overwritten_cells = target
            .iter()
            .filter(|&addr| {
                dest_sheet.has_formula_at(addr) || !matches!(dest_sheet.peek_value(addr), Value::Null)
            })
            .count();
        Ok(ConsolidatePlan {
            target,
            overwritten_cells,
            cells,
            outline_groups,
            sample,
        })
    }
}
