//! 以工作簿上下文恢复历史，保留同表与跨表依赖关系。
use super::*;
use crate::history_snapshot::HistorySnapshot;

impl Workbook {
    pub(crate) fn restore_history_snapshot(
        &mut self,
        sheet: usize,
        snapshot: &HistorySnapshot,
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
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
                    for cell in cells.iter().filter(|cell| cell.formula.is_some()) {
                        if !self
                            .try_set_formula(
                                sheet,
                                &cell.addr.to_string(),
                                cell.formula.as_ref().unwrap(),
                            )
                            .map_err(|_| "Could not restore cell formula.")?
                        {
                            return Err("Could not restore cell formula.");
                        }
                    }
                }
                let target = self
                    .sheet_mut(sheet)
                    .ok_or("History worksheet no longer exists.")?;
                target.restore_format_range_snapshot(snapshot.formats.clone());
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
        outcome
    }
}
