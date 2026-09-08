// 行列结构与撤销共用原生命令；这里只做边界类型转换。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuralEditJSON {
    action: &'static str,
    at: u32,
    count: u32,
}

impl From<einfach_excel_core::shift::ShiftEdit> for StructuralEditJSON {
    fn from(edit: einfach_excel_core::shift::ShiftEdit) -> Self {
        use einfach_excel_core::shift::ShiftEdit;
        let (action, at, count) = match edit {
            ShiftEdit::RowInsert { at, count } => ("insert-rows", at, count),
            ShiftEdit::RowDelete { at, count } => ("delete-rows", at, count),
            ShiftEdit::ColInsert { at, count } => ("insert-columns", at, count),
            ShiftEdit::ColDelete { at, count } => ("delete-columns", at, count),
        };
        Self { action, at, count }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 每次插删只产生一条历史；拒绝时数据、历史游标、剪贴板保持不变。
    pub fn edit_structure(
        &mut self,
        sheet: u32,
        action: &str,
        at: u32,
        count: u32,
    ) -> Result<bool, JsValue> {
        use einfach_excel_core::shift::ShiftEdit;
        let edit = match action {
            "insert-rows" => ShiftEdit::RowInsert { at, count },
            "delete-rows" => ShiftEdit::RowDelete { at, count },
            "insert-columns" => ShiftEdit::ColInsert { at, count },
            "delete-columns" => ShiftEdit::ColDelete { at, count },
            _ => return Err(JsValue::from_str("Invalid structural edit action.")),
        };
        let changed = self
            .history
            .edit_structure(&mut self.workbook, sheet as usize, edit)
            .map_err(JsValue::from_str)?;
        if changed {
            self.clipboard = None;
        }
        Ok(changed)
    }
}
