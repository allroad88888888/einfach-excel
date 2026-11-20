#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum ColumnFilterRuleJSON {
    Color {
        #[serde(rename = "colIndex")]
        col_index: u32,
        source: einfach_excel_core::filter::FilterColorSource,
        color: einfach_excel_core::filter::FilterColorTarget,
    },
    #[serde(rename = "date-period")]
    DatePeriod {
        #[serde(rename = "colIndex")]
        col_index: u32,
        period: einfach_excel_core::filter::FilterDatePeriod,
    },
    Top {
        #[serde(rename = "colIndex")]
        col_index: u32,
        direction: FilterTopDirectionJSON,
        unit: FilterTopUnitJSON,
        value: u16,
    },
    Equals {
        #[serde(rename = "colIndex")]
        col_index: u32,
        value: String,
        #[serde(rename = "caseSensitive", default, skip_serializing_if = "is_false")]
        case_sensitive: bool,
    },
    Contains {
        #[serde(rename = "colIndex")]
        col_index: u32,
        value: String,
        #[serde(rename = "caseSensitive", default, skip_serializing_if = "is_false")]
        case_sensitive: bool,
    },
    Range {
        #[serde(rename = "colIndex")]
        col_index: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
    List {
        #[serde(rename = "colIndex")]
        col_index: u32,
        values: Vec<String>,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FilterTopDirectionJSON { Top, Bottom }

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FilterTopUnitJSON { Items, Percent }

fn is_false(value: &bool) -> bool {
    !*value
}

impl ColumnFilterRuleJSON {
    fn from_rule(rule: &ColumnFilterRule) -> Self {
        match rule {
            ColumnFilterRule::Color { col_index, source, color } =>
                Self::Color { col_index: *col_index, source: *source, color: *color },
            ColumnFilterRule::DatePeriod { col_index, period } =>
                Self::DatePeriod { col_index: *col_index, period: *period },
            ColumnFilterRule::Top { col_index, direction, amount } => {
                use einfach_excel_core::filter::{FilterTopAmount, FilterTopDirection};
                let direction = match direction {
                    FilterTopDirection::Top => FilterTopDirectionJSON::Top,
                    FilterTopDirection::Bottom => FilterTopDirectionJSON::Bottom,
                };
                let (unit, value) = match amount {
                    FilterTopAmount::Items(value) => (FilterTopUnitJSON::Items, *value),
                    FilterTopAmount::Percent(value) => (FilterTopUnitJSON::Percent, u16::from(*value)),
                };
                Self::Top { col_index: *col_index, direction, unit, value }
            },
            ColumnFilterRule::Equals {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRuleJSON::Equals {
                col_index: *col_index,
                value: value.clone(),
                case_sensitive: *case_sensitive,
            },
            ColumnFilterRule::Contains {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRuleJSON::Contains {
                col_index: *col_index,
                value: value.clone(),
                case_sensitive: *case_sensitive,
            },
            ColumnFilterRule::Range {
                col_index,
                min,
                max,
            } => ColumnFilterRuleJSON::Range {
                col_index: *col_index,
                min: *min,
                max: *max,
            },
            ColumnFilterRule::List { col_index, values } => ColumnFilterRuleJSON::List {
                col_index: *col_index,
                values: values.clone(),
            },
        }
    }

    fn into_rule(self) -> ColumnFilterRule {
        match self {
            Self::Color { col_index, source, color } => ColumnFilterRule::Color { col_index, source, color },
            Self::DatePeriod { col_index, period } => ColumnFilterRule::DatePeriod { col_index, period },
            Self::Top { col_index, direction, unit, value } => {
                use einfach_excel_core::filter::{FilterTopAmount, FilterTopDirection};
                let direction = match direction {
                    FilterTopDirectionJSON::Top => FilterTopDirection::Top,
                    FilterTopDirectionJSON::Bottom => FilterTopDirection::Bottom,
                };
                let amount = match unit {
                    FilterTopUnitJSON::Items => FilterTopAmount::Items(value),
                    // Out-of-range wire values stay invalid at the native leaf gate.
                    FilterTopUnitJSON::Percent => FilterTopAmount::Percent(
                        u8::try_from(value).unwrap_or(0)),
                };
                ColumnFilterRule::Top { col_index, direction, amount }
            },
            ColumnFilterRuleJSON::Equals {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRule::Equals {
                col_index,
                value,
                case_sensitive,
            },
            ColumnFilterRuleJSON::Contains {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRule::Contains {
                col_index,
                value,
                case_sensitive,
            },
            ColumnFilterRuleJSON::Range {
                col_index,
                min,
                max,
            } => ColumnFilterRule::Range {
                col_index,
                min,
                max,
            },
            ColumnFilterRuleJSON::List { col_index, values } => {
                ColumnFilterRule::List { col_index, values }
            }
        }
    }
}

