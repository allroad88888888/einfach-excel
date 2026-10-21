// 验证规则的传输形状；判断数值是否合法始终交给 excel-core。
use einfach_excel_core::data_validation::{
    DataValidationKind, DataValidationOperator, DataValidationRule,
};
use einfach_excel_core::workbook::advanced_validation::AdvancedValidationOptions;

#[derive(Clone, Debug)]
struct DataValidationRuleJSON {
    rule: DataValidationKindJSON,
    options: AdvancedValidationOptions,
}

// 高级字段先从对象取出，再用 deny_unknown_fields 解析规则本身；未知属性不会被 flatten 吞掉。
impl<'de> Deserialize<'de> for DataValidationRuleJSON {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let mut value = serde_json::Value::deserialize(deserializer)?;
        let object = value.as_object_mut().ok_or_else(|| serde::de::Error::custom("Expected validation object"))?;
        let mut options = serde_json::Map::new();
        for key in ["inputMessage", "errorAlert"] {
            if let Some(value) = object.remove(key) { options.insert(key.into(), value); }
        }
        Ok(Self {
            rule: serde_json::from_value(value).map_err(serde::de::Error::custom)?,
            options: serde_json::from_value(serde_json::Value::Object(options)).map_err(serde::de::Error::custom)?,
        })
    }
}
impl Serialize for DataValidationRuleJSON {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut value = serde_json::to_value(&self.rule).map_err(serde::ser::Error::custom)?;
        let options = serde_json::to_value(&self.options).map_err(serde::ser::Error::custom)?;
        value.as_object_mut().unwrap().extend(options.as_object().unwrap().clone());
        value.serialize(serializer)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ValidationAnchorJSON { row: u32, col: u32 }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum DataValidationKindJSON {
    CustomFormula {
        formula: String,
        #[serde(default)]
        anchor: Option<ValidationAnchorJSON>,
        #[serde(default = "validation_ignore_blank_default", rename = "ignoreBlank")]
        ignore_blank: bool,
    },
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
        use DataValidationKindJSON::*;
        let (kind, ignore_blank, operator) = match self.rule {
            CustomFormula { formula, anchor, ignore_blank } => {
                let anchor = anchor.unwrap_or(ValidationAnchorJSON { row: 0, col: 0 });
                (DataValidationKind::CustomFormula { formula, anchor: CellAddress::new(anchor.row, anchor.col) },
                    ignore_blank, DataValidationOperator::Between)
            }
            WholeNumber {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::WholeNumber { min, max },
                ignore_blank,
                operator,
            ),
            Decimal {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Decimal { min, max },
                ignore_blank,
                operator,
            ),
            Date {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Date { min, max },
                ignore_blank,
                operator,
            ),
            Time {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::Time { min, max },
                ignore_blank,
                operator,
            ),
            TextLength {
                min,
                max,
                ignore_blank,
                operator,
            } => (
                DataValidationKind::TextLength { min, max },
                ignore_blank,
                operator,
            ),
            List {
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
            options: self.options,
        };
        rule.validate_definition()?;
        Ok(rule)
    }

    fn from_rule(rule: &DataValidationRule) -> Self {
        let ignore_blank = rule.ignore_blank;
        let operator = rule.operator;
        use DataValidationKindJSON::*;
        let kind = match &rule.kind {
            DataValidationKind::CustomFormula { formula, anchor } => CustomFormula {
                formula: formula.clone(), anchor: Some(ValidationAnchorJSON { row: anchor.row, col: anchor.col }), ignore_blank,
            },
            DataValidationKind::WholeNumber { min, max } => WholeNumber {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
            },
            DataValidationKind::Decimal { min, max } => Decimal {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
            },
            DataValidationKind::List { items } => List {
                items: items.clone(),
                ignore_blank,
            },
            DataValidationKind::Date { min, max } => Date {
                min: min.clone(),
                max: max.clone(),
                ignore_blank,
                operator,
            },
            DataValidationKind::Time { min, max } => Time {
                min: min.clone(),
                max: max.clone(),
                ignore_blank,
                operator,
            },
            DataValidationKind::TextLength { min, max } => TextLength {
                min: *min,
                max: *max,
                ignore_blank,
                operator,
            },
        };
        Self { rule: kind, options: rule.options.clone() }
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
