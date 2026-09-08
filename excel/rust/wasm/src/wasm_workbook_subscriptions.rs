/// Per-cell subscription bookkeeping for `WasmWorkbook`. The sheet index is
/// retained so topology operations can remap or remove the token. The stable
/// facade subscription itself owns callback delivery and is handed back to
/// `Sheet::unsubscribe_cell` on teardown.
struct WorkbookCellSubscription {
    sheet_idx: usize,
    sub: CellSubscription,
}

impl WasmWorkbook {
    /// 归档保留原 Sheet，因此不能再假设删掉 JS token 就会释放原生回调。
    fn prepare_sheet_removal(&mut self, index: usize) -> bool {
        if self.history.is_pending()
            || self.workbook.is_inside_custom_call()
            || index >= self.workbook.sheet_count()
            || self.workbook.sheet_count() <= 1
        {
            return false;
        }
        let tokens: Vec<_> = self
            .subscriptions
            .iter()
            .filter_map(|(token, entry)| (entry.sheet_idx == index).then_some(*token))
            .collect();
        for token in tokens {
            self.unsubscribe_cell(token);
        }
        true
    }

    fn remap_history_subscriptions(&mut self, before: &[u64]) {
        for entry in self.subscriptions.values_mut() {
            if let Some(index) = (0..self.workbook.sheet_count()).find(|index| {
                self.workbook.sheet_key(*index) == before.get(entry.sheet_idx).copied()
            }) {
                entry.sheet_idx = index;
            }
        }
    }
}

fn remap_sheet_index_after_move(idx: usize, from: usize, to: usize) -> usize {
    if from == to {
        return idx;
    }
    if idx == from {
        return to;
    }
    if from < to && idx > from && idx <= to {
        return idx - 1;
    }
    if to < from && idx >= to && idx < from {
        return idx + 1;
    }
    idx
}
