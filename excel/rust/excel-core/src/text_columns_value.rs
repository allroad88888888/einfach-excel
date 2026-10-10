//! 分列字段的显式类型转换；不执行公式，不借用键盘输入的前导引号标记。
use crate::cell_input::{parse_cell_input, CellInput};
use crate::date_serial::{excel_date_parts_to_serial, ExcelDateParts};
use crate::text_columns_number::TextColumnsNumberOptions;
use crate::{FractionDenominator, NumberFormat};
use einfach_core::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextColumnType {
    General,
    Text,
    Skip,
    Date(TextColumnDateOrder),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextColumnDateOrder { Mdy, Dmy, Ymd, Myd, Dym, Ydm }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextColumnRule {
    /// 从零开始的源字段编号；跳过列不会改变其它规则的编号。
    pub column: usize,
    pub kind: TextColumnType,
}

pub(crate) struct TextColumnValue {
    pub value: Value,
    pub number_format: Option<NumberFormat>,
}

impl TextColumnValue {
    /// 未指定的列延续原有文字模式；显式设置类型只修改数字格式，不碰其它样式。
    pub fn parse(text: String, kind: Option<TextColumnType>, numbers: Option<TextColumnsNumberOptions>) -> Self {
        if text.is_empty() {
            return Self { value: Value::Null, number_format: None };
        }
        let literal = |format| Self { value: Value::Text(text.clone()), number_format: format };
        match kind {
            None => literal(None),
            Some(TextColumnType::Text) => literal(Some(NumberFormat::Text)),
            Some(TextColumnType::Skip) => unreachable!("skipped fields are removed before conversion"),
            Some(TextColumnType::Date(order)) => match parse_ordered_date(&text, order) {
                Some(value) => Self { value: Value::Number(value),
                    number_format: Some(NumberFormat::Date("yyyy-mm-dd".into())) },
                // 非法日期保留原文，不能按另一种地区顺序偷偷猜测。
                None => literal(Some(NumberFormat::General)),
            },
            Some(TextColumnType::General) => {
                if text.starts_with('\'') {
                    return literal(Some(NumberFormat::General));
                }
                let parsed = if let Some(options) = numbers {
                    if let Some(normalized) = options.normalize(&text) {
                        match parse_cell_input(&normalized, false) {
                            value @ (CellInput::Literal(Value::Number(_)) | CellInput::Percentage { .. }) => value,
                            // 溢出或非有限数保留原始地区写法，不留下归一化后的伪数值。
                            _ => return literal(Some(NumberFormat::General)),
                        }
                    } else {
                        match parse_cell_input(&text, false) {
                            // 显式地区选项不能被默认小数点解析偷偷覆盖。
                            CellInput::Literal(Value::Number(_)) | CellInput::Percentage { .. } =>
                                return literal(Some(NumberFormat::General)),
                            value => value,
                        }
                    }
                } else { parse_cell_input(&text, false) };
                let (value, format) = match parsed {
                    CellInput::Literal(value) => (value, NumberFormat::General),
                    CellInput::Percentage { value, digits } =>
                        (Value::Number(value), NumberFormat::Percent { digits }),
                    CellInput::Date(value) =>
                        (Value::Number(value), NumberFormat::Date("yyyy-mm-dd".into())),
                    CellInput::Time { value, pattern } =>
                        (Value::Number(value), NumberFormat::Time(pattern.into())),
                    CellInput::Fraction { value, denominator } => (Value::Number(value),
                        NumberFormat::Fraction { denominator: FractionDenominator::Fixed(denominator) }),
                    CellInput::Formula(_) => unreachable!("formula parsing is disabled"),
                };
                Self { value, number_format: Some(format) }
            }
        }
    }

    pub fn display(&self) -> String {
        match (&self.value, &self.number_format) {
            (Value::Number(value), Some(format)) => crate::CellFormat {
                number_format: format.clone(), ..Default::default()
            }.format_number(*value),
            _ => crate::value_to_display(&self.value),
        }
    }

    pub fn retained_bytes(&self) -> usize {
        // 数字格式元数据也计入事务预算，不能只计算原始字符串。
        (match &self.value { Value::Text(text) => text.len(), _ => 0 }) + 256
    }
}

/// 数字日期接受 /、-、. 或无分隔的八位日期；两位年固定使用 00..29→2000，30..99→1900。
fn parse_ordered_date(text: &str, order: TextColumnDateOrder) -> Option<f64> {
    let text = text.trim();
    let indices = match order {
        TextColumnDateOrder::Mdy => [2, 0, 1], TextColumnDateOrder::Dmy => [2, 1, 0],
        TextColumnDateOrder::Ymd => [0, 1, 2], TextColumnDateOrder::Myd => [1, 0, 2],
        TextColumnDateOrder::Dym => [1, 2, 0], TextColumnDateOrder::Ydm => [0, 2, 1],
    };
    let parts: Vec<&str> = if text.len() == 8 && text.bytes().all(|b| b.is_ascii_digit()) {
        let widths = std::array::from_fn::<_, 3, _>(|i| if i == indices[0] { 4 } else { 2 });
        vec![&text[..widths[0]], &text[widths[0]..widths[0] + widths[1]], &text[widths[0] + widths[1]..]]
    } else {
        let separator = text.chars().find(|c| matches!(c, '/' | '-' | '.'))?;
        text.split(separator).map(str::trim).collect()
    };
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit())) {
        return None;
    }
    let year_text = parts[indices[0]];
    if !matches!(year_text.len(), 2 | 4) || parts[indices[1]].len() > 2 || parts[indices[2]].len() > 2 {
        return None;
    }
    let mut year: i32 = year_text.parse().ok()?;
    if year_text.len() == 2 { year += if year < 30 { 2000 } else { 1900 }; }
    let month = parts[indices[1]].parse().ok()?;
    let day = parts[indices[2]].parse().ok()?;
    if !(1900..=9999).contains(&year) || day == 0 { return None; }
    excel_date_parts_to_serial(ExcelDateParts { year, month, day, fraction: 0.0 })
}
