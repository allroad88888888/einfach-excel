//! 数据验证的原生规则；只判断候选值，不写单元格、不改变公式重算。
use crate::{excel_general_to_text, CellRange};
use einfach_core::Value;
use std::sync::Arc;

/// 本批只提供闭区间与显式列表；公式来源不是不透明字符串占位。
#[derive(Clone, Debug, PartialEq)]
pub enum DataValidationKind {
    WholeNumber { min: f64, max: f64 },
    Decimal { min: f64, max: f64 },
    List { items: Vec<String> },
}

#[derive(Clone, Debug, PartialEq)]
pub struct DataValidationRule {
    pub kind: DataValidationKind,
    pub ignore_blank: bool,
}

/// 区域拆分共享不可变规则，不为大选区创建逐格配置或复制下拉选项。
#[derive(Clone, Debug, PartialEq)]
pub struct DataValidationRegion {
    pub range: CellRange,
    pub rule: Arc<DataValidationRule>,
}

pub const MAX_VALIDATION_REGIONS: usize = 4096;
pub const MAX_VALIDATION_LIST_ITEMS: usize = 1024;
pub const MAX_VALIDATION_LIST_BYTES: usize = 64 * 1024;

impl DataValidationRule {
    pub fn validate_definition(&self) -> Result<(), &'static str> {
        match &self.kind {
            DataValidationKind::WholeNumber { min, max }
            | DataValidationKind::Decimal { min, max } => {
                if !min.is_finite() || !max.is_finite() || min > max {
                    return Err("Enter finite bounds with minimum not greater than maximum.");
                }
            }
            DataValidationKind::List { items } => {
                if items.is_empty() || items.len() > MAX_VALIDATION_LIST_ITEMS {
                    return Err("Enter between 1 and 1024 list items.");
                }
                if items
                    .iter()
                    .any(|item| item.is_empty() || item.contains(['\r', '\n', '\0']))
                {
                    return Err("Each list item must be nonempty and occupy one line.");
                }
                if items.iter().map(String::len).sum::<usize>() > MAX_VALIDATION_LIST_BYTES {
                    return Err("The validation list exceeds 64 KiB.");
                }
            }
        }
        Ok(())
    }

    /// 使用已经解析好的 Rust 值；数字文本不能绕过 Text 格式变成数值。
    pub fn accepts(&self, value: &Value) -> bool {
        if matches!(value, Value::Null) || matches!(value, Value::Text(text) if text.is_empty()) {
            return self.ignore_blank;
        }
        match &self.kind {
            DataValidationKind::WholeNumber { min, max }
            | DataValidationKind::Decimal { min, max } => match value {
                Value::Number(number) => {
                    number.is_finite()
                        && number >= min
                        && number <= max
                        && (!matches!(self.kind, DataValidationKind::WholeNumber { .. })
                            || number.fract() == 0.0)
                }
                _ => false,
            },
            DataValidationKind::List { items } => {
                let text = match value {
                    Value::Text(text) => text.clone(),
                    Value::Number(number) if number.is_finite() => excel_general_to_text(*number),
                    Value::Boolean(value) => if *value { "TRUE" } else { "FALSE" }.into(),
                    _ => return false,
                };
                // 列表不区分大小写，但不擅自裁掉用户选项中的空格。
                let folded = text.to_lowercase();
                items.iter().any(|item| item.to_lowercase() == folded)
            }
        }
    }
}
