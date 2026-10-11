// 命名区域的 WASM 边界：只转换载荷，定义与历史始终归 Rust。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct NamedRangeJSON {
    name: String,
    target: Option<NamedRangeTargetJSON>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct NamedRangeTargetJSON {
    sheet: usize,
    range: [u32; 4],
}

impl NamedRangeTargetJSON {
    fn into_target(self) -> (usize, CellRange) {
        let [r0, c0, r1, c1] = self.range;
        (
            self.sheet,
            CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1)),
        )
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum NamedRangeActionJSON {
    Create {
        name: String,
        target: NamedRangeTargetJSON,
    },
    Update {
        name: String,
        #[serde(rename = "newName")]
        new_name: String,
        target: Option<NamedRangeTargetJSON>,
    },
    Delete {
        name: String,
    },
}

impl NamedRangeActionJSON {
    fn into_action(self) -> einfach_excel_core::workbook::NamedRangeAction {
        use einfach_excel_core::workbook::NamedRangeAction as Action;
        match self {
            Self::Create { name, target } => {
                let (sheet, range) = target.into_target();
                Action::Create { name, sheet, range }
            }
            Self::Update {
                name,
                new_name,
                target,
            } => Action::Update {
                name,
                new_name,
                target: target.map(NamedRangeTargetJSON::into_target),
            },
            Self::Delete { name } => Action::Delete { name },
        }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn list_named_ranges(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.named_ranges_json())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn change_named_range(&mut self, sheet: u32, action: JsValue) -> Result<bool, JsValue> {
        let action: NamedRangeActionJSON = serde_wasm_bindgen::from_value(action)
            .map_err(|error| JsValue::from_str(&format!("Invalid named-range action: {error}")))?;
        self.history
            .change_named_range(&mut self.workbook, sheet as usize, action.into_action())
            .map_err(JsValue::from_str)
    }
}

impl WasmWorkbook {
    fn named_ranges_json(&self) -> Vec<NamedRangeJSON> {
        self.workbook
            .snapshot_named_ranges()
            .into_iter()
            .map(|entry| NamedRangeJSON {
                name: entry.name,
                target: entry.target.map(|(sheet, range)| NamedRangeTargetJSON {
                    sheet,
                    range: [
                        range.start.row,
                        range.start.col,
                        range.end.row,
                        range.end.col,
                    ],
                }),
            })
            .collect()
    }

    fn restore_named_ranges_json(
        workbook: &mut Workbook,
        entries: Vec<NamedRangeJSON>,
    ) -> Result<(), String> {
        let entries = entries
            .into_iter()
            .map(|entry| einfach_excel_core::workbook::NamedRangeSnapshot {
                name: entry.name,
                target: entry.target.map(NamedRangeTargetJSON::into_target),
            })
            .collect();
        workbook
            .restore_named_ranges(entries)
            .map_err(|error| format!("persistence restore named ranges failed: {error}"))
    }
}
