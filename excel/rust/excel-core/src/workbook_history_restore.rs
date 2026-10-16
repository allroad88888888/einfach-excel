//! 以工作簿上下文恢复历史，保留同表与跨表依赖关系。
use super::*;
use crate::history_snapshot::HistorySnapshot;

impl Workbook {
    /// 多表/多范围在同一 Store batch 内恢复，不向订阅者发布一半完成的移动。
    pub(crate) fn restore_history_snapshots(
        &mut self,
        snapshots: &[(usize, HistorySnapshot)],
    ) -> Result<(), &'static str> {
        if snapshots
            .iter()
            .any(|(sheet, _)| self.sheet(*sheet).is_none())
        {
            return Err("History worksheet no longer exists.");
        }
        if snapshots.iter().any(|(_, snapshot)| snapshot.merges.is_some()) {
            let parts: Vec<_> = snapshots.iter().map(|(sheet, snapshot)| (*sheet, snapshot)).collect();
            return self.restore_merged_history_snapshots(&parts);
        }
        let arrays = snapshots.iter().filter(|(_, snapshot)| snapshot.cells.is_some())
            .flat_map(|(sheet, snapshot)| self.array_dependents_for_range(*sheet, snapshot.range))
            .collect();
        let observers: Vec<_> = self.sheets.iter_mut()
            .map(Sheet::suspend_structure_notifications).collect();
        let store = self.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = snapshots
                .iter()
                .try_for_each(|(sheet, snapshot)| snapshot.restore(self, *sheet));
        });
        // 单份快照可能处在嵌套 batch 内；整次撤销传播完成后才投影数组并通知。
        self.recompute_array_formula_groups(arrays);
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }

    pub(crate) fn restore_history_snapshot(
        &mut self,
        sheet: usize,
        snapshot: &HistorySnapshot,
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let arrays = if snapshot.cells.is_some() {
            self.array_dependents_for_range(sheet, snapshot.range)
        } else { Vec::new() };
        let store = self.store.clone();
        let mut outcome = Ok(());
        store.batch(|_| {
            outcome = (|| {
                if let Some(cells) = &snapshot.cells {
                    if snapshot.range.start == snapshot.range.end {
                        self.clear_cell(sheet, &snapshot.range.start.to_string());
                    } else {
                        self.clear_range(sheet, snapshot.range);
                    }
                    // 先恢复字面量，再恢复公式；全部位于同一事务，订阅者看不到中间态。
                    for cell in cells.iter().filter(|cell| cell.formula.is_none()) {
                        self.try_set_cell(
                            sheet,
                            &cell.addr.to_string(),
                            cell.value.clone().unwrap_or(Value::Null),
                        )
                        .map_err(|_| "Could not restore cell value.")?;
                    }
                    // 恢复不是新输入校验；保留错误/循环源码，也不投影半份快照。
                    self.sheets[sheet].restore_formula_sources(cells.iter().filter_map(|cell| {
                        cell.formula.as_deref().map(|source| (cell.addr, source))
                    }));
                }
                let target = self
                    .sheet_mut(sheet)
                    .ok_or("History worksheet no longer exists.")?;
                target.restore_format_range_snapshot(snapshot.formats.clone());
                target.restore_hyperlinks(snapshot.range, &snapshot.hyperlinks);
                for (col, _) in
                    target.col_widths_in_range(snapshot.range.start.col, snapshot.range.end.col)
                {
                    target.clear_col_width(col);
                }
                for (col, width) in &snapshot.column_widths {
                    target.set_col_width(*col, *width);
                }
                Ok(())
            })();
        });
        self.recompute_array_formula_groups(arrays);
        outcome
    }
}
