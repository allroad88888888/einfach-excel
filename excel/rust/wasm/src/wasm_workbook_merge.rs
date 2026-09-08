// 合并动作与矩形的 WASM 边界；内容、格式、确认及历史由 Rust 工作簿处理。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn merge_cells(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        action: &str,
        discard: bool,
    ) -> Result<bool, JsValue> {
        use einfach_excel_core::MergeAction;
        let action = match action {
            "merge" => MergeAction::Merge,
            "center" => MergeAction::Center,
            "unmerge" => MergeAction::Unmerge,
            _ => return Err(JsValue::from_str("Invalid merge action.")),
        };
        self.history
            .merge_cells(
                &mut self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                action,
                discard,
            )
            .map_err(JsValue::from_str)
    }

    /// 全表稀疏合并矩形，按 [起始行, 起始列, 结束行, 结束列] 连续编码。
    /// 不裁成视口内的小矩形；键盘导航与屏幕外锚点仍使用真实边界。
    pub fn merged_ranges(&self, sheet: u32) -> Result<Vec<u32>, JsValue> {
        let target = self
            .workbook
            .sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("The worksheet no longer exists."))?;
        Ok(target
            .merged_ranges()
            .iter()
            .flat_map(|r| [r.start.row, r.start.col, r.end.row, r.end.col])
            .collect())
    }
}
