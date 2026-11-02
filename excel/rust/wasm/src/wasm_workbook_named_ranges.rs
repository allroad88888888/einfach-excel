// 命名区域的 WASM 边界：只转换载荷，定义与历史始终归 Rust。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct NamedRangeJSON {
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<usize>,
    target: Option<NamedRangeTargetJSON>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    formula: Option<String>,
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
enum RawNamedRangeActionJSON {
    Create {
        name: String,
        #[serde(default)]
        scope: Option<usize>,
        #[serde(default)]
        target: Option<NamedRangeTargetJSON>,
        #[serde(default)]
        formula: Option<String>,
    },
    Update {
        name: String,
        #[serde(default)]
        scope: Option<usize>,
        #[serde(rename = "newName")]
        new_name: String,
        #[serde(default, rename = "newScope")]
        new_scope: Option<Option<usize>>,
        #[serde(default)]
        target: Option<NamedRangeTargetJSON>,
        #[serde(default)]
        formula: Option<String>,
    },
    Delete {
        name: String,
        #[serde(default)]
        scope: Option<usize>,
    },
}

#[derive(Deserialize)]
#[serde(try_from = "RawNamedRangeActionJSON")]
enum NamedRangeActionJSON {
    Create {
        name: String,
        scope: Option<usize>,
        target: Option<NamedRangeTargetJSON>,
        formula: Option<String>,
    },
    Update {
        name: String,
        scope: Option<usize>,
        new_name: String,
        new_scope: Option<Option<usize>>,
        target: Option<NamedRangeTargetJSON>,
        formula: Option<String>,
    },
    Delete {
        name: String,
        scope: Option<usize>,
    },
}

impl TryFrom<RawNamedRangeActionJSON> for NamedRangeActionJSON {
    type Error = &'static str;

    fn try_from(raw: RawNamedRangeActionJSON) -> Result<Self, Self::Error> {
        match raw {
            RawNamedRangeActionJSON::Create {
                name,
                scope,
                target,
                formula,
            } => {
                if target.is_none() == formula.is_none() {
                    return Err("Create requires exactly one of target or formula.");
                }
                Ok(Self::Create {
                    name,
                    scope,
                    target,
                    formula,
                })
            }
            RawNamedRangeActionJSON::Update {
                name,
                scope,
                new_name,
                new_scope,
                target,
                formula,
            } => {
                if target.is_some() && formula.is_some() {
                    return Err("Update cannot specify both target and formula.");
                }
                Ok(Self::Update {
                    name,
                    scope,
                    new_name,
                    new_scope,
                    target,
                    formula,
                })
            }
            RawNamedRangeActionJSON::Delete { name, scope } => Ok(Self::Delete { name, scope }),
        }
    }
}

impl NamedRangeActionJSON {
    fn into_action(self) -> einfach_excel_core::workbook::NamedRangeAction {
        use einfach_excel_core::workbook::NamedRangeAction as Action;
        match self {
            Self::Create {
                name,
                scope: None,
                target: Some(target),
                formula: None,
            } => {
                let (sheet, range) = target.into_target();
                Action::Create { name, sheet, range }
            }
            Self::Create {
                name,
                scope,
                target,
                formula,
            } => Action::CreateScoped {
                name,
                scope,
                target: target.map(NamedRangeTargetJSON::into_target),
                formula,
            },
            Self::Update {
                name,
                scope: None,
                new_name,
                new_scope: None,
                target,
                formula: None,
            } => Action::Update {
                name,
                new_name,
                target: target.map(NamedRangeTargetJSON::into_target),
            },
            Self::Update {
                name,
                scope,
                new_name,
                new_scope,
                target,
                formula,
            } => Action::UpdateScoped {
                name,
                scope,
                new_name,
                new_scope,
                target: target.map(NamedRangeTargetJSON::into_target),
                formula,
            },
            Self::Delete { name, scope: None } => Action::Delete { name },
            Self::Delete { name, scope } => Action::DeleteScoped { name, scope },
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
                scope: entry.scope,
                target: entry.target.map(|(sheet, range)| NamedRangeTargetJSON {
                    sheet,
                    range: [
                        range.start.row,
                        range.start.col,
                        range.end.row,
                        range.end.col,
                    ],
                }),
                formula: entry.formula,
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
                scope: entry.scope,
                target: entry.target.map(NamedRangeTargetJSON::into_target),
                formula: entry.formula,
            })
            .collect();
        workbook
            .restore_named_ranges(entries)
            .map_err(|error| format!("persistence restore named ranges failed: {error}"))
    }
}
