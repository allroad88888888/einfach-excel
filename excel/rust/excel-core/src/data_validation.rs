//! 数据验证的原生规则；只判断候选值，不写单元格、不改变公式重算。
use crate::{excel_general_to_text, CellRange};
use einfach_core::Value;
use std::sync::Arc;

/// 所有可比较规则共用条件；旧快照缺省仍是闭区间。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DataValidationOperator {
    #[default]
    Between,
    NotBetween,
    Equal,
    NotEqual,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
}

impl DataValidationOperator {
    fn uses_range(self) -> bool {
        matches!(self, Self::Between | Self::NotBetween)
    }

    fn accepts(self, value: f64, min: f64, max: f64) -> bool {
        if !value.is_finite() {
            return false;
        }
        match self {
            Self::Between => value >= min && value <= max,
            Self::NotBetween => value < min || value > max,
            Self::Equal => value == min,
            Self::NotEqual => value != min,
            Self::GreaterThan => value > min,
            Self::GreaterThanOrEqual => value >= min,
            Self::LessThan => value < min,
            Self::LessThanOrEqual => value <= min,
        }
    }
}

/// 闭区间与显式列表；日期/时间边界保留输入文本，复用唯一原生解析器。
#[derive(Clone, Debug, PartialEq)]
pub enum DataValidationKind {
    WholeNumber { min: f64, max: f64 },
    Decimal { min: f64, max: f64 },
    Date { min: String, max: String },
    Time { min: String, max: String },
    TextLength { min: f64, max: f64 },
    List { items: Vec<String> },
}

#[derive(Clone, Debug, PartialEq)]
pub struct DataValidationRule {
    pub kind: DataValidationKind,
    pub ignore_blank: bool,
    pub operator: DataValidationOperator,
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
    fn bounds(&self) -> Option<(f64, f64)> {
        match &self.kind {
            DataValidationKind::WholeNumber { min, max }
            | DataValidationKind::Decimal { min, max }
            | DataValidationKind::TextLength { min, max } => Some((*min, *max)),
            DataValidationKind::Date { min, max } => Some((
                crate::date_serial::parse_iso_date(min)?,
                crate::date_serial::parse_iso_date(max)?,
            )),
            DataValidationKind::Time { min, max } => Some((clock_bound(min)?, clock_bound(max)?)),
            DataValidationKind::List { .. } => None,
        }
    }

    pub fn validate_definition(&self) -> Result<(), &'static str> {
        match &self.kind {
            DataValidationKind::WholeNumber { min, max }
            | DataValidationKind::Decimal { min, max }
            | DataValidationKind::TextLength { min, max } => {
                if !min.is_finite() || !max.is_finite() || (self.operator.uses_range() && min > max)
                {
                    return Err("Enter finite bounds with minimum not greater than maximum.");
                }
                if matches!(self.kind, DataValidationKind::TextLength { .. })
                    && (*min < 0.0 || *max < 0.0 || min.fract() != 0.0 || max.fract() != 0.0)
                {
                    return Err("Text length bounds must be nonnegative whole numbers.");
                }
            }
            DataValidationKind::Date { .. } | DataValidationKind::Time { .. } => {
                if !self
                    .bounds()
                    .is_some_and(|(min, max)| !self.operator.uses_range() || min <= max)
                {
                    return Err(
                        "Enter valid date/time bounds with minimum not greater than maximum.",
                    );
                }
            }
            DataValidationKind::List { items } => {
                if self.operator != DataValidationOperator::Between {
                    return Err("List validation does not support comparison operators.");
                }
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
            // 不忽略空白时，长度规则实际检查长度 0，而非一律拒绝空串。
            return self.ignore_blank
                || matches!(self.kind,
                DataValidationKind::TextLength { min, max } if self.operator.accepts(0.0, min, max));
        }
        match &self.kind {
            DataValidationKind::WholeNumber { .. }
            | DataValidationKind::Decimal { .. }
            | DataValidationKind::Date { .. }
            | DataValidationKind::Time { .. } => match value {
                Value::Number(number) => {
                    let Some((min, max)) = self.bounds() else {
                        return false;
                    };
                    // 区间外或大小比较不能绕过原有值类型/日期/钟点域限制。
                    let valid_type = match self.kind {
                        DataValidationKind::WholeNumber { .. } => number.fract() == 0.0,
                        DataValidationKind::Date { .. } => {
                            crate::date_serial::valid_date_serial(*number)
                        }
                        DataValidationKind::Time { .. } => (0.0..1.0).contains(number),
                        _ => true,
                    };
                    valid_type && self.operator.accepts(*number, min, max)
                }
                _ => false,
            },
            DataValidationKind::TextLength { min, max } => scalar_text(value).is_some_and(|text| {
                // 与引擎 LEN 一致：Unicode 标量数量，不是 UTF-8 字节数或显示宽度。
                let length = text.chars().count() as f64;
                self.operator.accepts(length, *min, *max)
            }),
            DataValidationKind::List { items } => {
                let Some(text) = scalar_text(value) else {
                    return false;
                };
                // 列表不区分大小写，但不擅自裁掉用户选项中的空格。
                let folded = text.to_lowercase();
                items.iter().any(|item| item.to_lowercase() == folded)
            }
        }
    }
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::Text(text) => Some(text.clone()),
        Value::Number(number) if number.is_finite() => Some(excel_general_to_text(*number)),
        Value::Boolean(value) => Some(if *value { "TRUE" } else { "FALSE" }.into()),
        _ => None,
    }
}

fn clock_bound(input: &str) -> Option<f64> {
    // 这是一天内的时间范围，不把 24:00 或累计时长伪装成钟点。
    if input.len() > 11 {
        return None;
    }
    match crate::time_input::parse_time(input)? {
        crate::cell_input::CellInput::Time { value, .. } if (0.0..1.0).contains(&value) => {
            Some(value)
        }
        _ => None,
    }
}
