// 验证规则的传输形状；判断数值是否合法始终交给 excel-core。
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum DataValidationRuleJSON {
    WholeNumber {
        min: f64,
        max: f64,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    Decimal {
        min: f64,
        max: f64,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    List {
        items: Vec<String>,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
}

fn validation_ignore_blank_default() -> bool {
    true
}

impl DataValidationRuleJSON {
    fn into_rule(self) -> Result<DataValidationRule, &'static str> {
        let (kind, ignore_blank) = match self {
            Self::WholeNumber {
                min,
                max,
                ignore_blank,
            } => (DataValidationKind::WholeNumber { min, max }, ignore_blank),
            Self::Decimal {
                min,
                max,
                ignore_blank,
            } => (DataValidationKind::Decimal { min, max }, ignore_blank),
            Self::List {
                items,
                ignore_blank,
            } => (DataValidationKind::List { items }, ignore_blank),
        };
        let rule = DataValidationRule { kind, ignore_blank };
        rule.validate_definition()?;
        Ok(rule)
    }

    fn from_rule(rule: &DataValidationRule) -> Self {
        let ignore_blank = rule.ignore_blank;
        match &rule.kind {
            DataValidationKind::WholeNumber { min, max } => Self::WholeNumber {
                min: *min,
                max: *max,
                ignore_blank,
            },
            DataValidationKind::Decimal { min, max } => Self::Decimal {
                min: *min,
                max: *max,
                ignore_blank,
            },
            DataValidationKind::List { items } => Self::List {
                items: items.clone(),
                ignore_blank,
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DataValidationRegionJSON {
    // [startRow, startCol, endRow, endCol]，包含两端，不在传输层纠正非法坐标。
    range: [u32; 4],
    rule: DataValidationRuleJSON,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SheetDataValidationJSON {
    sheet: usize,
    regions: Vec<DataValidationRegionJSON>,
}
