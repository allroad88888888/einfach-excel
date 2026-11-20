// Advanced filter copy preview and mutation use the native plan and history.
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_advanced_filter_copy(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: AdvancedFilterCopyRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let preview = self
            .workbook
            .preview_advanced_filter_copy(&request.into())
            .map_err(|error| {
                JsValue::from_str(match error {
                    FilterError::InvalidCriteria(message) => message,
                    FilterError::InvalidSheet => "The worksheet no longer exists.",
                    FilterError::ProtectedWorksheet => {
                        einfach_excel_core::protection::PROTECTED_ERROR
                    }
                    _ => "Choose a header and data rows for the filter.",
                })
            })?;
        serde_wasm_bindgen::to_value(&AdvancedFilterCopyPreviewJSON::from(preview))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn copy_advanced_filter(
        &mut self,
        request: JsValue,
        approval: JsValue,
    ) -> Result<JsValue, JsValue> {
        let request: AdvancedFilterCopyRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let approval: Option<FilterOverwriteApprovalJSON> =
            serde_wasm_bindgen::from_value(approval)
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let approval = approval.map(|value| FilterOverwriteApproval {
            target: value.target.into_range(),
            count: value.count,
        });
        let report = self
            .history
            .copy_advanced_filter(&mut self.workbook, &request.into(), approval)
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&AdvancedFilterCopyReportJSON {
            target: FilterRangeJSON::from_range(report.target),
            matched_rows: report.matched_rows,
            changed_cells: report.changed_cells,
        })
        .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
