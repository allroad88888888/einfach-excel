// 只读值列表协议：去重、计数和分页都在 Rust；不返回整列数据。
use einfach_excel_core::workbook::{FilterValuesPage, FilterValuesQuery};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterValuesRequestJSON {
    sheet: usize,
    column: u32,
    #[serde(default)]
    table: Option<String>,
    #[serde(default)]
    search: String,
    #[serde(default)]
    offset: u32,
    limit: u32,
}

impl FilterValuesRequestJSON {
    fn query(&self, workbook: &Workbook) -> Result<FilterValuesPage, String> {
        workbook.filter_values(self.sheet, FilterValuesQuery { column: self.column,
            table: self.table.as_deref(), search: &self.search, offset: self.offset, limit: self.limit })
    }
}

#[derive(Serialize)]
struct FilterValueEntryJSON { value: String, count: u32 }

#[derive(Serialize)]
struct FilterValuesPageJSON { values: Vec<FilterValueEntryJSON>, total: u32, offset: u32 }

impl From<FilterValuesPage> for FilterValuesPageJSON {
    fn from(page: FilterValuesPage) -> Self {
        Self { total: page.total, offset: page.offset, values: page.values.into_iter()
            .map(|entry| FilterValueEntryJSON { value: entry.value, count: entry.count }).collect() }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn filter_values(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: FilterValuesRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let page = request.query(&self.workbook).map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&FilterValuesPageJSON::from(page))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
