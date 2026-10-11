// 用户 Table 操作的 WASM 边界；旧注册表原语不承担交互历史。
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum TableActionJSON {
    Create {
        name: Option<String>,
        range: [u32; 4],
    },
    Rename {
        name: String,
        #[serde(rename = "newName")]
        new_name: String,
    },
    Resize {
        name: String,
        range: [u32; 4],
    },
    RenameColumn {
        name: String,
        column: String,
        #[serde(rename = "newName")]
        new_name: String,
    },
    ConvertToRange {
        name: String,
    },
    TotalsRow {
        name: String,
        enabled: bool,
        #[serde(rename = "rowCount")]
        row_count: u32,
    },
    TotalFunction {
        name: String,
        column: String,
        function: String,
    },
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn change_table(&mut self, sheet: u32, action: JsValue) -> Result<bool, JsValue> {
        let action: TableActionJSON = serde_wasm_bindgen::from_value(action)
            .map_err(|error| JsValue::from_str(&format!("Invalid table action: {error}")))?;
        self.apply_table_action(sheet as usize, action)
            .map_err(|error| JsValue::from_str(&error))
    }
}

impl WasmWorkbook {
    fn apply_table_action(
        &mut self,
        sheet: usize,
        action: TableActionJSON,
    ) -> Result<bool, String> {
        let sheet_name = self
            .workbook
            .name(sheet)
            .ok_or("The worksheet no longer exists.")?;
        if let TableActionJSON::Rename { name, .. }
        | TableActionJSON::Resize { name, .. }
        | TableActionJSON::RenameColumn { name, .. }
        | TableActionJSON::ConvertToRange { name }
        | TableActionJSON::TotalsRow { name, .. }
        | TableActionJSON::TotalFunction { name, .. } = &action
        {
            let table = self
                .workbook
                .get_table(name)
                .ok_or("The table no longer exists.")?;
            if table.sheet_name() != sheet_name {
                return Err("The table belongs to another worksheet.".into());
            }
        }
        match action {
            TableActionJSON::Create {
                name,
                range: [r0, c0, r1, c1],
            } => {
                self.history.create_table(
                    &mut self.workbook,
                    sheet,
                    CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1)),
                    name.as_deref(),
                )?;
                Ok(true)
            }
            TableActionJSON::Rename { name, new_name } => {
                self.history
                    .rename_table(&mut self.workbook, &name, &new_name)
            }
            TableActionJSON::Resize { name, range: [r0, c0, r1, c1] } => {
                self.history.resize_table(&mut self.workbook, &name,
                    CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1)))
            }
            TableActionJSON::RenameColumn { name, column, new_name } => {
                self.history.rename_table_column(&mut self.workbook, &name, &column, &new_name)
            }
            TableActionJSON::ConvertToRange { name } => {
                self.history
                    .convert_table_to_range(&mut self.workbook, &name)?;
                Ok(true)
            }
            TableActionJSON::TotalsRow {
                name,
                enabled,
                row_count,
            } => {
                let table = self.workbook.get_table(&name).unwrap();
                if enabled
                    && !table.has_totals()
                    && (row_count == 0
                        || row_count > 1_048_576
                        || table.range().end.row + 1 >= row_count)
                {
                    return Err(
                        "The totals row is outside this worksheet. Make room below the table."
                            .into(),
                    );
                }
                self.history
                    .set_table_totals_row(&mut self.workbook, &name, enabled)
            }
            TableActionJSON::TotalFunction {
                name,
                column,
                function,
            } => {
                let function =
                    TotalsFunction::from_id(&function).ok_or("Invalid total function.")?;
                self.history
                    .set_table_total_function(&mut self.workbook, &name, &column, function)
            }
        }
    }
}
