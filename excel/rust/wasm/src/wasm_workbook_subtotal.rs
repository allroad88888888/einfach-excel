// Native adapter for inspecting and changing subtotal-managed lists.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubtotalListRequestJSON {
    sheet: usize,
    selection: einfach_excel_core::subtotal::SubtotalBounds,
    row_count: u32,
    col_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubtotalChangeRequestJSON {
    list: SubtotalListRequestJSON,
    action: SubtotalActionJSON,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum SubtotalActionJSON {
    Apply { settings: SubtotalSettingsJSON },
    Remove,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubtotalSettingsJSON {
    group_by_column: u32,
    calculation: einfach_excel_core::subtotal::SubtotalCalculation,
    placement: einfach_excel_core::subtotal::SubtotalPlacement,
    replace: bool,
    total_suffix: String,
    grand_total: String,
}

impl From<SubtotalChangeRequestJSON> for einfach_excel_core::subtotal::SubtotalRequest {
    fn from(request: SubtotalChangeRequestJSON) -> Self {
        use einfach_excel_core::subtotal::{SubtotalAction, SubtotalSettings};
        let action = match request.action {
            SubtotalActionJSON::Apply { settings } => SubtotalAction::Apply(SubtotalSettings {
                group_by_column: settings.group_by_column,
                calculation: settings.calculation,
                placement: settings.placement,
                replace: settings.replace,
                total_suffix: settings.total_suffix,
                grand_total: settings.grand_total,
            }),
            SubtotalActionJSON::Remove => SubtotalAction::Remove,
        };
        Self {
            sheet: request.list.sheet,
            selection: request.list.selection.into(),
            row_count: request.list.row_count,
            col_count: request.list.col_count,
            action,
        }
    }
}

#[derive(Serialize)]
struct SubtotalFieldJSON {
    column: u32,
    name: String,
}

#[derive(Serialize)]
struct SubtotalListJSON {
    range: einfach_excel_core::subtotal::SubtotalBounds,
    fields: Vec<SubtotalFieldJSON>,
    placement: Option<einfach_excel_core::subtotal::SubtotalPlacement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notice: Option<&'static str>,
}

#[derive(Serialize)]
struct SubtotalReportJSON {
    range: einfach_excel_core::subtotal::SubtotalBounds,
    edits: Vec<StructuralEditJSON>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn inspect_subtotal_list(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: SubtotalListRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let list = self
            .workbook
            .inspect_subtotal_list(
                request.sheet,
                request.selection.into(),
                request.row_count,
                request.col_count,
            )
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&SubtotalListJSON {
            range: list.range.into(),
            fields: list
                .fields
                .into_iter()
                .map(|field| SubtotalFieldJSON {
                    column: field.column,
                    name: field.name,
                })
                .collect(),
            placement: list.placement,
            notice: list.notice,
        })
        .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn change_subtotals(&mut self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: SubtotalChangeRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let changed = self
            .history
            .change_subtotals(&mut self.workbook, &request.into())
            .map_err(JsValue::from_str)?;
        let report = changed.map(|report| {
            self.clipboard = None;
            SubtotalReportJSON {
                range: report.range.into(),
                edits: report
                    .edits
                    .into_iter()
                    .map(StructuralEditJSON::from)
                    .collect(),
            }
        });
        serde_wasm_bindgen::to_value(&report).map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
