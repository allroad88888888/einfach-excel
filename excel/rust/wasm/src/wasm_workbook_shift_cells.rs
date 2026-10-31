// 插入/删除单元格（局部位移）的 WASM 边界；几何、拒绝条件、引用改写及历史均由 Rust 处理。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn shift_cells(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        direction: &str,
    ) -> Result<bool, JsValue> {
        use einfach_excel_core::CellShiftDirection;
        let direction = match direction {
            "insert-right" => CellShiftDirection::InsertRight,
            "insert-down" => CellShiftDirection::InsertDown,
            "delete-left" => CellShiftDirection::DeleteLeft,
            "delete-up" => CellShiftDirection::DeleteUp,
            _ => return Err(JsValue::from_str("Invalid cell shift direction.")),
        };
        let changed = self
            .history
            .shift_cells(
                &mut self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                direction,
            )
            .map_err(JsValue::from_str)?;
        // 剪切快照的源坐标已不再代表原单元格。
        if changed {
            self.clipboard = None;
        }
        Ok(changed)
    }
}
