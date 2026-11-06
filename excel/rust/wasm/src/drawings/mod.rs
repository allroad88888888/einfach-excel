// 浮动对象 WASM 入口只转发原生目录语义；对象类型与载荷由插件解释。
include!("file_ranges.rs");
include!("persistence.rs");
include!("cross_sheet_tests.rs");

#[wasm_bindgen]
impl WasmWorkbook {
    /// 按绘制顺序返回本表对象目录（JSON 数组）。
    pub fn sheet_drawings(&self, sheet: u32) -> Result<String, JsValue> {
        let target = self
            .workbook
            .sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("The object worksheet no longer exists."))?;
        serde_json::to_string(target.drawings())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// 新 id 插入到最上层，已有 id 原位替换；一次调用一条撤销记录。
    pub fn set_drawing(&mut self, sheet: u32, drawing_json: &str) -> Result<bool, JsValue> {
        let drawing =
            serde_json::from_str::<einfach_excel_core::drawings::SheetDrawing>(drawing_json)
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.history
            .set_drawing(&mut self.workbook, sheet as usize, drawing)
            .map_err(JsValue::from_str)
    }

    pub fn remove_drawing(&mut self, sheet: u32, id: &str) -> Result<bool, JsValue> {
        self.history
            .remove_drawing(&mut self.workbook, sheet as usize, id)
            .map_err(JsValue::from_str)
    }

    /// 置于顶层（`to_front`）或底层；一次调用一条撤销记录。
    pub fn reorder_drawing(&mut self, sheet: u32, id: &str, to_front: bool) -> Result<bool, JsValue> {
        self.history
            .reorder_drawing(&mut self.workbook, sheet as usize, id, to_front)
            .map_err(JsValue::from_str)
    }
}
