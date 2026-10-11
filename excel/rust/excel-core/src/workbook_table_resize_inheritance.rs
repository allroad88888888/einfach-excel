//! 手动向下扩表时继承计算列；新数据区与范围调整共用同一条历史。
use super::*;
use crate::workbook_history::MAX_BYTES;
use crate::CellSnapshot;

impl TableDefinitionChange {
    pub(crate) fn apply_resizing(&mut self, workbook: &mut Workbook) -> Result<(), String> {
        let after = self.after.as_ref().expect("resize keeps the table");
        let columns: Vec<_> = after.calculated_columns.iter().enumerate()
            .filter_map(|(offset, formula)| formula.as_ref()
                .map(|formula| (after.range.start.col + offset as u32, formula)))
            .collect();
        let first = after.range.start.row + u32::from(after.has_headers);
        let end = after.range.end.row + 1 - u32::from(after.has_totals);
        let activates = self.before.insert_row && !after.insert_row && first < end;
        if after.insert_row || columns.is_empty()
            || (!activates && after.range.end.row <= self.before.range.end.row) {
            return self.apply(workbook, false).map_err(str::to_string);
        }
        let range = CellRange::new(
            CellAddress::new(if activates { first }
                else { self.before.range.end.row + 1 - u32::from(self.before.has_totals) },
                after.range.start.col),
            CellAddress::new(end - 1, after.range.end.col),
        );
        let before = HistorySnapshot::capture(&workbook.sheets[self.sheet], range, true);
        // 原汇总行会先搬走；其余已有值/公式（包括返回空值的公式）都保留。
        let occupied: HashSet<_> = before.cells.as_ref().unwrap().iter()
            .filter(|cell| !(self.before.has_totals && cell.addr.row == self.before.range.end.row))
            .map(|cell| cell.addr).collect();
        let filled_columns: HashSet<_> = columns.iter().map(|(col, _)| *col).collect();
        let count = range.rows() as usize * columns.len()
            - occupied.iter().filter(|addr| filled_columns.contains(&addr.col)).count();
        if count == 0 { return self.apply(workbook, false).map_err(str::to_string); }
        let mut bytes = self.retained_bytes() + 2 * before.retained_bytes() + count * 96;
        if bytes > MAX_BYTES { return Err("Expanding this table exceeds the 32 MiB undo budget.".into()); }
        let mut formulas = Vec::with_capacity(count);
        for row in range.start.row..=range.end.row {
            for (col, formula) in &columns {
                let addr = CellAddress::new(row, *col);
                if occupied.contains(&addr) { continue; }
                let source = formula.formula_at(row)?;
                bytes += source.len();
                if bytes > MAX_BYTES {
                    return Err("Expanding this table exceeds the 32 MiB undo budget.".into());
                }
                formulas.push(CellSnapshot::formula(addr, source));
            }
        }
        let mut arrays = workbook.array_dependents_for_range(self.sheet, range);
        arrays.extend(workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms()));
        let observers: Vec<_> = workbook.sheets.iter_mut()
            .map(Sheet::suspend_structure_notifications).collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = self.apply(workbook, false).map_err(str::to_string);
            if result.is_err() { return; }
            // 回滚先恢复调整范围后的内容，原几何事务才可按自己的前后像撤回。
            let rollback = HistorySnapshot::capture(&workbook.sheets[self.sheet], range, true);
            result = workbook.set_table_formulas(self.sheet, &formulas).and_then(|_| {
                formulas.iter().try_for_each(|cell| {
                    let value = crate::sheet::collapse_array_for_eval(
                        workbook.sheets[self.sheet].peek_value(cell.addr));
                    workbook.validate_input_value(self.sheet, cell.addr, &value)
                })
            }).map_err(str::to_string);
            if result.is_err() {
                rollback.restore(workbook, self.sheet).expect("resize keeps its worksheet");
                self.apply(workbook, true).expect("resize rollback retains its prepared cells");
                return;
            }
            // 原汇总行与范围内被改写的引用改由这一份快照持有，避免重叠历史。
            self.cells.retain(|(old, _)| !old.range.intersects(range));
            self.formulas.retain(|formula| !formula.cell_in_range(self.sheet, range));
            self.cells.push((before, HistorySnapshot::capture(&workbook.sheets[self.sheet], range, true)));
            if self.retained_bytes() > MAX_BYTES {
                self.apply(workbook, true).expect("resized table retains its final snapshots");
                result = Err("Expanding this table exceeds the 32 MiB undo budget.".into());
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}
