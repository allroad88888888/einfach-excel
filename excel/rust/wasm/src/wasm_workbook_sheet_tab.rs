// 工作表页签命令：复制、隐藏/取消隐藏、页签颜色。校验与历史全部在 Rust 内完成。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn sheet_hidden(&self, idx: u32) -> bool {
        self.workbook.sheet_hidden(idx as usize)
    }

    /// 空字符串表示没有颜色，否则为大写 `#RRGGBB`。
    pub fn sheet_tab_color(&self, idx: u32) -> String {
        self.workbook
            .sheet_tab_color(idx as usize)
            .unwrap_or_default()
            .to_owned()
    }

    /// 在源表之后创建副本并返回其索引；订阅与剪贴板源表索引随之后移。
    pub fn duplicate_sheet(&mut self, idx: u32) -> Result<u32, JsValue> {
        let keys: Vec<_> = (0..self.workbook.sheet_count())
            .filter_map(|index| self.workbook.sheet_key(index))
            .collect();
        let index = self
            .history
            .duplicate_sheet(&mut self.workbook, idx as usize)
            .map_err(JsValue::from_str)?;
        self.remap_history_subscriptions(&keys);
        if let Some(clipboard) = self.clipboard.as_mut() {
            clipboard.remap_source_sheet(|source| Some(if source >= index { source + 1 } else { source }));
        }
        Ok(index as u32)
    }

    pub fn set_sheet_hidden(&mut self, idx: u32, hidden: bool) -> Result<bool, JsValue> {
        self.history
            .set_sheet_hidden(&mut self.workbook, idx as usize, hidden)
            .map_err(JsValue::from_str)
    }

    /// `None` 或空字符串清除颜色。
    pub fn set_sheet_tab_color(&mut self, idx: u32, color: Option<String>) -> Result<bool, JsValue> {
        let color = color.filter(|value| !value.is_empty());
        self.history
            .set_sheet_tab_color(&mut self.workbook, idx as usize, color.as_deref())
            .map_err(JsValue::from_str)
    }
}
