// 手动行列可见性由 Rust 持有；只把索引投影给页面，不以尺寸 0 代替隐藏。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SheetVisibilityJSON {
    manual_rows: Vec<u32>,
    manual_columns: Vec<u32>,
    filter_rows: Vec<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    outline_rows: Vec<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    outline_columns: Vec<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outline: Option<einfach_excel_core::outline::SheetOutline>,
    // 与隐藏集合取自同一原生状态，避免宿主再读一份完整筛选快照。
    filter_rules: Vec<ColumnFilterRuleJSON>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filter_range: Option<FilterRangeJSON>,
}

/// 列隐藏不能混进行隐藏快照，也不能以零列宽持久化。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SheetHiddenColumnsJSON {
    sheet: usize,
    columns: Vec<u32>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 一次确认只产生一条原生历史；取消隐藏使用原范围，全表范围即恢复全部。
    pub fn set_visibility(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        action: &str,
    ) -> Result<bool, JsValue> {
        self.history
            .set_visibility(
                &mut self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                action,
            )
            .map_err(JsValue::from_str)
    }

    /// 包括屏幕外索引，几何定位不依赖当前挂载的单元格。
    pub fn sheet_visibility(&self, sheet: u32) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.sheet_visibility_json(sheet as usize)
            .map_err(JsValue::from_str)?)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

impl WasmWorkbook {
    fn hidden_columns_json(&self) -> Vec<SheetHiddenColumnsJSON> {
        (0..self.workbook.sheet_count()).filter_map(|sheet| {
            let columns = self.workbook.sheet_visibility(sheet).ok()?.columns;
            (!columns.is_empty()).then_some(SheetHiddenColumnsJSON { sheet, columns })
        }).collect()
    }

    fn restore_hidden_columns_json(workbook: &mut Workbook, entries: Vec<SheetHiddenColumnsJSON>) -> Result<(), String> {
        let mut seen = HashSet::new();
        for entry in entries {
            if !seen.insert(entry.sheet) || entry.columns.len() > 16_384
                || entry.columns.windows(2).any(|pair| pair[0] >= pair[1]) {
                return Err("Invalid persisted hidden columns.".into());
            }
            let mut state = workbook.sheet_visibility(entry.sheet).map_err(str::to_string)?;
            state.columns = entry.columns;
            workbook.restore_sheet_visibility(entry.sheet, &state).map_err(str::to_string)?;
        }
        Ok(())
    }

    fn sheet_visibility_json(&self, sheet: usize) -> Result<SheetVisibilityJSON, &'static str> {
        use einfach_excel_core::outline::OutlineAxis;
        let state = self
            .workbook
            .sheet_visibility(sheet)?;
        let outline = self.workbook.sheet(sheet).unwrap().outline();
        Ok(SheetVisibilityJSON {
            manual_rows: state.rows,
            manual_columns: state.columns,
            outline_rows: outline.hidden_indices(OutlineAxis::Row).collect(),
            outline_columns: outline.hidden_indices(OutlineAxis::Column).collect(),
            outline: (!outline.rows.is_empty() || !outline.columns.is_empty()).then(|| outline.clone()),
            filter_rows: self.workbook.filter_hidden_rows(sheet as usize),
            filter_range: self.workbook.filter_range(sheet as usize).map(FilterRangeJSON::from_range),
            filter_rules: self.workbook.filter_rules(sheet as usize)
                .iter().map(ColumnFilterRuleJSON::from_rule).collect(),
        })
    }
}
