// 工作表视图选项：网格线与行列标题显示。只改展现，不进撤销栈，但算一次真实持久修改。
#[wasm_bindgen]
impl WasmWorkbook {
    /// bit 0 = 隐藏网格线，bit 1 = 隐藏行列标题；0 表示全部显示。
    pub fn sheet_view_flags(&self, idx: u32) -> u32 {
        let options = self.workbook.sheet_view_options(idx as usize);
        u32::from(options.hide_gridlines) | (u32::from(options.hide_headings) << 1)
    }

    pub fn set_sheet_view(
        &mut self,
        idx: u32,
        hide_gridlines: bool,
        hide_headings: bool,
    ) -> Result<bool, JsValue> {
        let options = einfach_excel_core::workbook::SheetViewOptions { hide_gridlines, hide_headings };
        let changed = self
            .workbook
            .set_sheet_view_options(idx as usize, options)
            .map_err(JsValue::from_str)?;
        if changed {
            let key = self.workbook.sheet_key(idx as usize).unwrap();
            self.history.record_metadata_mutation(key);
        }
        Ok(changed)
    }
}
