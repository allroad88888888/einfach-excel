//! 生成插入/删除单元格的完整前后像；只读工作簿，不做任何写入。
use super::preflight::OFF_SHEET_ERROR;
use super::*;
use crate::shift::rewrite_band_shift;

/// 带内地址列表的统一搬运：删除区丢弃，推出画布即拒绝（只对有内容的条目）。
fn move_entries<T>(shift: &CellShift, entries: &mut Vec<(CellAddress, T)>) -> Result<(), &'static str> {
    let vanishing = shift.vanishing();
    let mut moved = Vec::with_capacity(entries.len());
    for (addr, value) in entries.drain(..) {
        match shift.map(addr) {
            Some(next) => moved.push((next, value)),
            None if shift.is_insert() && vanishing.contains(addr) => return Err(OFF_SHEET_ERROR),
            None => {}
        }
    }
    *entries = moved;
    Ok(())
}

impl CellShiftChange {
    pub(crate) fn prepare(
        workbook: &Workbook,
        sheet: usize,
        selection: CellRange,
        direction: CellShiftDirection,
    ) -> Result<Self, &'static str> {
        let shift = CellShift::new(selection, direction);
        workbook.validate_cell_shift(sheet, &shift)?;
        let (edit, band, area) = (shift.edit, shift.band, shift.area());
        let name = workbook.name(sheet).unwrap().to_owned();
        let target = &workbook.sheets[sheet];
        let before = HistorySnapshot::capture_with_merges(target, area, true, true);
        let mut after = before.clone();
        let mut cells = Vec::new();
        for mut cell in after.cells.take().unwrap_or_default() {
            let Some(next) = shift.map(cell.addr) else {
                if shift.is_insert() {
                    return Err(OFF_SHEET_ERROR);
                }
                continue;
            };
            if let Some(source) = &cell.formula {
                if let Some(mut expr) = parse_formula(source) {
                    if rewrite_band_shift(&mut expr, &name, true, edit, band) {
                        cell.formula = Some(crate::render_formula(&expr));
                    }
                }
            }
            cell.addr = next;
            cells.push(cell);
        }
        cells.sort_by_key(|cell| (cell.addr.row, cell.addr.col));
        after.cells = Some(cells);
        // 只有格式的尾部格在插入时随画布边界丢弃，与 Excel 一致。
        after.formats.cell_styles = std::mem::take(&mut after.formats.cell_styles)
            .into_iter()
            .filter_map(|(addr, style)| shift.map(addr).map(|next| (next, style)))
            .collect();
        move_entries(&shift, &mut after.hyperlinks)?;
        move_entries(&shift, &mut after.notes)?;
        move_entries(&shift, &mut after.comments)?;
        // 预检已保证每个相交的合并格整块移动或整块删除。
        after.merges = after
            .merges
            .take()
            .map(|merges| merges.into_iter().filter_map(|merged| shift.map_rect(merged)).collect());

        let formulas = FormulaSourceChange::prepare(workbook, &|owner, bounds, template, expr| {
            (template.is_some() || owner != sheet || !area.intersects(bounds))
                && rewrite_band_shift(expr, &name, owner == sheet, edit, band)
        });
        let rules = FormulaRuleChange::prepare_cell_shift(workbook, sheet, edit, band)?;
        let lambdas = FormulaLambdaChange::prepare_with_context(
            workbook,
            &|scope_key, is_formula, expr| {
                let local = is_formula
                    && match scope_key {
                        Some(sk) => Some(sk) == workbook.sheet_key(sheet),
                        None => sheet == 0,
                    };
                rewrite_band_shift(expr, &name, local, edit, band)
            },
        );
        let named_ranges = workbook.named_ranges_for_cell_shift(sheet, edit, band)?;
        let validations_before = target.data_validations().to_vec();
        let mut validations_after = Vec::new();
        for region in &validations_before {
            validations_after.extend(shift.shift_validation_region(region, &name));
        }
        if validations_after.len() > crate::data_validation::MAX_VALIDATION_REGIONS {
            return Err("Too many data-validation regions.");
        }
        let change = Self {
            sheet,
            shift,
            sheet_key: workbook.sheet_keys[sheet],
            cells: (before, after),
            formulas,
            rules,
            lambdas,
            named_ranges,
            validations: (validations_before, validations_after),
        };
        if change.retained_bytes() > crate::workbook_history::MAX_BYTES {
            return Err("Shifting these cells exceeds the 32 MiB undo budget.");
        }
        Ok(change)
    }
}
