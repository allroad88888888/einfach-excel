//! Follow worksheet row and column changes using the native structural mapping.
use super::region::{SubtotalBounds, SubtotalRegion};
use crate::formula::RangeBounds;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::{shift_structural_range, ShiftEdit};
use crate::{CellAddress, CellRange, Sheet};

fn shift_cell(address: CellAddress, edit: ShiftEdit) -> Option<CellAddress> {
    let shifted = edit.apply(address);
    (shifted.row < EXCEL_MAX_ROWS && shifted.col < EXCEL_MAX_COLS).then_some(shifted)
}

fn shift_column(column: u32, edit: ShiftEdit) -> Option<u32> {
    shift_cell(CellAddress::new(0, column), edit).map(|address| address.col)
}

fn shifted_range(mut range: CellRange, edit: ShiftEdit) -> Option<CellRange> {
    shift_structural_range(&mut range.start, &mut range.end, RangeBounds::None, edit)
        .then_some(range)
}

fn shift_region(region: &mut SubtotalRegion, edit: ShiftEdit) -> bool {
    let Some(output) = shifted_range(region.output(), edit) else {
        return false;
    };
    let source = shifted_range(region.source.into(), edit).unwrap_or(output);
    region.source = SubtotalBounds::from(source);
    region.output_column = output.end.col;

    region.rows.retain_mut(|summary| {
        if edit.is_row_edit() {
            let Some(address) = shift_cell(CellAddress::new(summary.row, 0), edit) else {
                return false;
            };
            summary.row = address.row;
            summary.details = summary.details.take().and_then(|details| {
                let range = CellRange::new(
                    CellAddress::new(*details.start(), 0),
                    CellAddress::new(*details.end(), 0),
                );
                shifted_range(range, edit).map(|next| next.start.row..=next.end.row)
            });
            true
        } else {
            summary.shift_columns(|col| shift_column(col, edit))
        }
    });
    if !edit.is_row_edit() {
        let mut valid = true;
        for layer in &mut region.layers {
            if let Some(column) = shift_column(layer.group_by_column, edit) {
                layer.group_by_column = column;
            } else {
                valid = false;
            }
            for calculation in &mut layer.calculations {
                calculation.columns = calculation
                    .columns
                    .iter()
                    .filter_map(|&column| shift_column(column, edit))
                    .collect();
                valid &= !calculation.columns.is_empty();
            }
        }
        if !valid {
            region.layers.clear();
        }
    }
    !region.rows.is_empty()
}

impl Sheet {
    pub(crate) fn shift_subtotal_regions(&mut self, edit: ShiftEdit) {
        let mut removed = Vec::new();
        self.subtotal_regions.retain_mut(|region| {
            let keep = !edit.touches_range(&region.output()) || shift_region(region, edit);
            if !keep {
                removed.push(region.id);
            }
            keep
        });
        self.outline.rows.retain(|group| {
            group
                .subtotal
                .as_ref()
                .is_none_or(|owner| !removed.contains(&owner.id))
        });
    }
}
