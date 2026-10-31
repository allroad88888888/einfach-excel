//! 安装插入/删除单元格的某一侧前后像；先完整校验，再在一个 Store batch 内写入。
use super::*;

impl CellShiftChange {
    pub(crate) fn apply(&self, workbook: &mut Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot shift cells during a custom call.");
        }
        workbook.ensure_workbook_unprotected()?;
        if workbook.sheet_key(self.sheet) != Some(self.sheet_key) {
            return Err("The worksheet changed outside history.");
        }
        let (expected, next) = if undo {
            (&self.cells.1, &self.cells.0)
        } else {
            (&self.cells.0, &self.cells.1)
        };
        let target = &workbook.sheets[self.sheet];
        if HistorySnapshot::capture_with_merges(target, expected.range, true, true) != *expected {
            return Err("The shifted cells changed outside history.");
        }
        let (expected_rules, next_rules) = if undo {
            (&self.validations.1, &self.validations.0)
        } else {
            (&self.validations.0, &self.validations.1)
        };
        if target.data_validations() != expected_rules.as_slice() {
            return Err("Data validation changed outside history.");
        }
        for formula in &self.formulas {
            formula.validate(workbook, undo)?;
        }
        for rule in &self.rules {
            rule.validate(workbook, undo)?;
        }
        for lambda in &self.lambdas {
            lambda.validate(workbook, undo)?;
        }
        workbook.validate_named_range_restore(self.sheet, &self.named_ranges, undo)?;

        let mut arrays = workbook.array_dependents_for_range(self.sheet, self.shift.area());
        if !self.lambdas.is_empty() || !self.named_ranges.is_empty() {
            arrays.extend(workbook.named_array_dependents());
        }
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(|sheet| sheet.suspend_structure_notifications())
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            workbook.sheets[self.sheet].data_validations = next_rules.clone();
            for change in &self.named_ranges {
                change.apply(workbook, undo);
            }
            for lambda in &self.lambdas {
                lambda.apply(workbook, undo);
            }
            if !self.named_ranges.is_empty() || !self.lambdas.is_empty() {
                workbook.publish_atom_names();
            }
            result = workbook.restore_merged_history_snapshots(&[(self.sheet, next)]);
            for rule in &self.rules {
                rule.apply(workbook, undo);
            }
            for formula in &self.formulas {
                formula.apply(workbook, undo);
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, listeners) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(listeners);
        }
        // 移动后的格式需要在订阅恢复后重新发布外观。
        workbook.sheets[self.sheet].notify_format_range(self.shift.area());
        result
    }
}
