/// Per-cell subscription bookkeeping for `WasmWorkbook`. The sheet index is
/// retained so topology operations can remap or remove the token. The stable
/// facade subscription itself owns callback delivery and is handed back to
/// `Sheet::unsubscribe_cell` on teardown.
struct WorkbookCellSubscription {
    sheet_idx: usize,
    sub: CellSubscription,
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
