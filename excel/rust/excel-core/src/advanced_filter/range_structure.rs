//! Move committed criteria coordinates with worksheet structural edits.
use crate::advanced_filter::range_contract::{validate_data_range, MAX_CRITERIA_CELLS};
use crate::advanced_filter::range_state::CriteriaLink;
use crate::formula::RangeBounds;
use crate::shift::{shift_structural_range, ShiftEdit};
use crate::{CellRange, Workbook};

#[derive(Clone, Copy, Debug)]
pub(in crate::workbook) struct CriteriaShift {
    pub(in crate::workbook) owner: usize,
    owner_key: u64,
    before: CriteriaLink,
    after: CriteriaLink,
}

impl CriteriaShift {
    pub(in crate::workbook) fn resolved_owner(&self, workbook: &Workbook) -> Option<usize> {
        workbook.sheet_index_by_key(self.owner_key)
    }

    pub(in crate::workbook) fn apply(&self, workbook: &mut Workbook, undo: bool) {
        let Some(owner) = workbook.sheet_index_by_key(self.owner_key) else {
            return;
        };
        let link = if undo { self.before } else { self.after };
        workbook
            .sheet_mut(owner)
            .expect("known criteria owner")
            .set_filter_criteria_link(link);
    }

    pub(in crate::workbook) fn apply_to(&self, state: &mut crate::filter::SheetAutoFilter) {
        state.set_criteria_link(self.after);
    }
}

impl Workbook {
    pub(in crate::workbook) fn shifted_filter_criteria(
        &self,
        sheet: usize,
        edit: ShiftEdit,
        band: Option<(u32, u32)>,
    ) -> Vec<CriteriaShift> {
        let Some(sheet_key) = self.sheet_key(sheet) else {
            return Vec::new();
        };
        (0..self.sheet_count())
            .filter_map(|owner| {
                let before = self.sheet(owner)?.filter()?.range_criteria()?.link?;
                if before.sheet_key != Some(sheet_key) {
                    return None;
                }
                let current = before.range?;
                let next = shifted_range(current, edit, band);
                (next != Some(current)).then(|| CriteriaShift {
                    owner,
                    owner_key: self.sheet_key(owner).expect("known criteria owner"),
                    before,
                    after: CriteriaLink {
                        range: next,
                        ..before
                    },
                })
            })
            .collect()
    }
}

fn shifted_range(
    mut range: CellRange,
    edit: ShiftEdit,
    band: Option<(u32, u32)>,
) -> Option<CellRange> {
    let (at, count, row_delete) = match edit {
        ShiftEdit::RowInsert { at, count }
        | ShiftEdit::ColInsert { at, count }
        | ShiftEdit::ColDelete { at, count } => (at, count, false),
        ShiftEdit::RowDelete { at, count } => (at, count, true),
    };
    let (end, orthogonal) = if edit.is_row_edit() {
        (range.end.row, (range.start.col, range.end.col))
    } else {
        (range.end.col, (range.start.row, range.end.row))
    };
    if end < at || count == 0 {
        return Some(range);
    }
    if let Some((low, high)) = band {
        if high < orthogonal.0 || low > orthogonal.1 {
            return Some(range);
        }
        if low > orthogonal.0 || high < orthogonal.1 {
            // A partial band yields disconnected cells rather than one criteria rectangle.
            return None;
        }
    }
    if row_delete && at <= range.start.row && range.start.row < at.saturating_add(count) {
        return None;
    }
    let valid = shift_structural_range(&mut range.start, &mut range.end, RangeBounds::None, edit)
        && range.start.row < range.end.row
        && validate_data_range(range, MAX_CRITERIA_CELLS).is_ok();
    valid.then_some(range)
}
