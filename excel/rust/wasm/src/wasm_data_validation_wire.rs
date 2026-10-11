// 验证规则的传输形状；判断数值是否合法始终交给 excel-core。
use einfach_excel_core::data_validation::{
    DataValidationKind, DataValidationOperator, DataValidationRule,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum DataValidationRuleJSON {
    WholeNumber {
        min: f64,
        max: f64,
        #[serde(default, skip_serializing_if = "validation_operator_is_default")]
        operator: DataValidationOperator,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    Decimal {
        min: f64,
        max: f64,
        #[serde(default, skip_serializing_if = "validation_operator_is_default")]
        operator: DataValidationOperator,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    Date {
        min: String,
        max: String,
        #[serde(default, skip_serializing_if = "validation_operator_is_default")]
        operator: DataValidationOperator,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    Time {
        min: String,
        max: String,
        #[serde(default, skip_serializing_if = "validation_operator_is_default")]
        operator: DataValidationOperator,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
    TextLength {
        min: f64,
        max: f64,
        #[serde(default, skip_serializing_if = "validation_operator_is_default")]
        operator: DataValidationOperator,
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

fn validation_operator_is_default(value: &DataValidationOperator) -> bool {
    *value == DataValidationOperator::Between
}

impl DataValidationRuleJSON {
    fn into_rule(self) -> Result<DataValidationRule, &'static str> {
        let (kind, ignore_blank, operator) = match self {
            Self::WholeNumber {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::WholeNumber { min, max },
                ignore_blank,
                operator,
            ),
            Self::Decimal {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Decimal { min, max },
                ignore_blank,
                operator,
            ),
            Self::Date {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Date { min, max },
                ignore_blank,
                operator,
            ),
            Self::Time {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Time { min, max },
                ignore_blank,
                operator,
            ),
            Self::TextLength {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::TextLength { min, max },
                ignore_blank,
                operator,
            ),
            Self::List {
                items,
                ignore_blank,
            } => (
                DataValidationKind::List { items },
                ignore_blank,
                DataValidationOperator::Between,
            ),
        };
        let rule = DataValidationRule {
            kind,
            ignore_blank,
            operator,
        };
        rule.validate_definition()?;
        Ok(rule)
    }

    fn from_rule(rule: &DataValidationRule) -> Self {
        let ignore_blank = rule.ignore_blank;
        let operator = rule.operator;
        match &rule.kind {
            DataValidationKind::WholeNumber { min, max } => Self::WholeNumber {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
            },
            DataValidationKind::Decimal { min, max } => Self::Decimal {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
            },
            DataValidationKind::List { items } => Self::List {
                items: items.clone(),
                ignore_blank,
            },
            DataValidationKind::Date { min, max } => Self::Date {
                min: min.clone(),
                max: max.clone(),
                ignore_blank,
                operator,
            },
            DataValidationKind::Time { min, max } => Self::Time {
                min: min.clone(),
                max: max.clone(),
                ignore_blank,
                operator,
            },
            DataValidationKind::TextLength { min, max } => Self::TextLength {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
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
