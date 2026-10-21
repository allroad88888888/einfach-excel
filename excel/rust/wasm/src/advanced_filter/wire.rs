/// A bounded two-level condition schema; leaves retain the existing wire contract.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ColumnFilterGroupJSON {
    rules: Vec<ColumnFilterRuleJSON>,
}

impl ColumnFilterGroupJSON {
    fn from_group(group: &einfach_excel_core::advanced_filter::ColumnFilterGroup) -> Self {
        Self { rules: group.rules.iter().map(ColumnFilterRuleJSON::from_rule).collect() }
    }
    fn into_group(self) -> einfach_excel_core::advanced_filter::ColumnFilterGroup {
        einfach_excel_core::advanced_filter::ColumnFilterGroup {
            rules: self.rules.into_iter().map(ColumnFilterRuleJSON::into_rule).collect(),
        }
    }
}
