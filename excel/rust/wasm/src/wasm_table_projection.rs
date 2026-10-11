/// UI 只读投影；函数选择从单元格派生，持久化仍使用不含衍生字段的 TableJSON。
#[derive(Serialize)]
struct TableProjectionJSON {
    #[serde(flatten)]
    table: TableJSON,
    #[serde(rename = "totalFunctions")]
    total_functions: Vec<Option<&'static str>>,
}

impl WasmWorkbook {
    fn table_projection_json(&self) -> Result<Vec<TableProjectionJSON>, String> {
        self.workbook.list_tables()
            .into_iter()
            .map(|entry| {
                let sheet = self.sheet_index_by_name(entry.sheet_name()).unwrap_or(0);
                let table = TableJSON::from_entry_with_filter_rows(entry, sheet, false);
                let total_functions = self
                    .workbook
                    .table_total_functions(&table.name)
                    .map_err(|error| error.to_string())?
                    .into_iter()
                    .map(|function| function.map(TotalsFunction::id))
                    .collect();
                Ok(TableProjectionJSON {
                    table,
                    total_functions,
                })
            })
            .collect()
    }
}
