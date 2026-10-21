//! Editable ranges follow native row/column geometry; settings never enter content history.
use super::ProtectionRange;
use crate::{shift::ShiftEdit, Workbook};

impl Workbook {
    pub fn shift_protection_ranges(&mut self, sheet: usize, edit: ShiftEdit) {
        let Some(key) = self.sheet_key(sheet) else { return; };
        let Some(state) = self.protection.get_mut(&key) else { return; };
        let (at, count, insert) = match edit {
            ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => (at, count, true),
            ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => (at, count, false),
        };
        state.unlocked_ranges = state.unlocked_ranges.iter().filter_map(|range| {
            let mut shifted = *range;
            let (first, last) = if edit.is_row_edit() {
                crate::shift::shift_interval(range.row_start, range.row_end, at, count, insert, 1_048_576)?
            } else {
                crate::shift::shift_interval(range.col_start, range.col_end, at, count, insert, 16_384)?
            };
            if edit.is_row_edit() { shifted.row_start = first; shifted.row_end = last; }
            else { shifted.col_start = first; shifted.col_end = last; }
            shifted.validate().is_ok().then_some(ProtectionRange::from(shifted.cell_range()))
        }).collect();
    }
}
