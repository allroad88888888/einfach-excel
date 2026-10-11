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
    ConvertToRange {
        name: String,
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
        if let TableActionJSON::Rename { name, .. } | TableActionJSON::ConvertToRange { name } =
            &action
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
            TableActionJSON::ConvertToRange { name } => {
                self.history
                    .convert_table_to_range(&mut self.workbook, &name)?;
                Ok(true)
            }
        }
    }
}
