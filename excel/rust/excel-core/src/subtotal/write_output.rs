//! Write the generated subtotal labels and formulas through the existing cell engine.
use super::owned_output::subtotal_cell_style;
use crate::{CellRange, CellSnapshot, StyleScope, Workbook};
use einfach_core::Value;

pub(super) fn write_subtotal_cells(
    workbook: &mut Workbook,
    sheet: usize,
    cells: &[CellSnapshot],
    range: CellRange,
    validate: bool,
) -> Result<(), &'static str> {
    let target = &workbook.sheets[sheet];
    if cells.iter().any(|cell| {
        target.has_formula_at(cell.addr)
            || target.peek_value(cell.addr) != Value::Null
            || target.merged_range_at(cell.addr).is_some()
            || target
                .spill_intersecting(CellRange::single(cell.addr))
                .is_some()
    }) {
        return Err("A subtotal output cell is occupied.");
    }
    for cell in cells {
        let addr = cell.addr.to_string();
        if let Some(formula) = &cell.formula {
            let written = workbook
                .try_set_formula(sheet, &addr, formula)
                .map_err(|_| "Could not write a subtotal formula.")?;
            if !written {
                return Err("Could not write a subtotal formula.");
            }
        } else {
            workbook
                .try_set_cell(sheet, &addr, cell.value.clone().unwrap_or(Value::Null))
                .map_err(|_| "Could not write a subtotal label.")?;
        }
        workbook.sheets[sheet].patch_format_range(
            CellRange::single(cell.addr),
            StyleScope::Cell,
            subtotal_cell_style(),
        );
    }
    if validate && !cells.is_empty() {
        workbook.settle_validation_candidate(sheet, range);
        for cell in cells {
            workbook.validate_input_value(
                sheet,
                cell.addr,
                &workbook.sheets[sheet].peek_value(cell.addr),
            )?;
        }
    }
    Ok(())
}
