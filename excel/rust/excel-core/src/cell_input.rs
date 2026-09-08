//! 单元格输入文本的往返语义；编辑和外部剪贴板共用，不解析显示格式。
use einfach_core::Value;

#[derive(Debug, PartialEq)]
pub enum CellInput {
    Formula(String),
    Literal(Value),
    Percentage { value: f64, digits: u8 },
}

/// 只识别明确的输入语法；不完整数字、非有限数、日期等仍保留为文字。
pub fn parse_cell_input(input: &str, allow_formula: bool) -> CellInput {
    if let Some(text) = input.strip_prefix('\'') {
        return CellInput::Literal(Value::Text(text.into()));
    }
    let trimmed = input.trim();
    if allow_formula && trimmed.starts_with('=') {
        return CellInput::Formula(trimmed.into());
    }
    if input.is_empty() {
        return CellInput::Literal(Value::Null);
    }
    for (word, value) in [("true", true), ("false", false)] {
        if trimmed.eq_ignore_ascii_case(word) {
            return CellInput::Literal(Value::Boolean(value));
        }
    }
    if let Some(number) = trimmed.strip_suffix('%').map(str::trim) {
        if let Some(value) = finite_number(number) {
            let (mantissa, exponent) = number.split_once(['e', 'E']).unwrap_or((number, "0"));
            let decimals = mantissa.split_once('.').map_or(0, |(_, part)| part.len());
            let digits = (decimals as i64)
                .saturating_sub(exponent.parse::<i64>().unwrap_or(0))
                .clamp(0, 15) as u8;
            return CellInput::Percentage {
                value: value / 100.0,
                digits,
            };
        }
    }
    CellInput::Literal(
        finite_number(trimmed)
            .map(Value::Number)
            .unwrap_or_else(|| Value::Text(input.into())),
    )
}

fn finite_number(input: &str) -> Option<f64> {
    input
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
}

/// 前导引号只是输入标记，不写进文字；再次编辑时为可能被误识别的文字补回标记。
pub fn editable_cell_text(value: &Value, formula: &str) -> String {
    if !formula.is_empty() {
        return formula.to_owned();
    }
    match value {
        Value::Number(number) => number.to_string(),
        Value::Text(text) => match parse_cell_input(text, true) {
            CellInput::Literal(Value::Text(parsed)) if parsed == *text => text.clone(),
            _ => format!("'{text}"),
        },
        _ => crate::value_to_display(value),
    }
}

#[cfg(test)]
#[path = "cell_input_tests.rs"]
mod tests;
