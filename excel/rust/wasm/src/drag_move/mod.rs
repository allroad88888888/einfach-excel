// 拖动选区边框移动／复制只转发原生事务；不读写普通剪贴板与格式刷快照槽。

#[wasm_bindgen]
impl WasmWorkbook {
    /// 返回实际写入的目标矩形 `[rowStart, colStart, rowEnd, colEnd]`，并记入一步撤销。
    #[allow(clippy::too_many_arguments)]
    pub fn drag_transfer_range(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        target_row: u32,
        target_col: u32,
        copy: bool,
        replace: bool,
        row_count: u32,
        col_count: u32,
    ) -> Result<Vec<u32>, JsValue> {
        let transfer = einfach_excel_core::drag_move::DragTransfer {
            source: CellRange::new(
                CellAddress::new(start_row, start_col),
                CellAddress::new(end_row, end_col),
            ),
            target: CellAddress::new(target_row, target_col),
            copy,
            replace,
            row_count,
            col_count,
        };
        let range = self
            .workbook
            .drag_transfer(sheet_idx as usize, &transfer, Some(&mut self.history))
            .map_err(JsValue::from_str)?;
        Ok(vec![range.start.row, range.start.col, range.end.row, range.end.col])
    }
}

#[cfg(test)]
mod drag_move_tests {
    include!("tests.rs");
}
