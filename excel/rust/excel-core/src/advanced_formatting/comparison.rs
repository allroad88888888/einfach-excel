//! Duplicate keys use native number formatting and never read conditional-format output.
use crate::CellFormat;
use einfach_core::Value;
use serde::Deserialize;

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum DuplicateComparison {
    #[default]
    Value,
    DisplayText,
}

/// The eligibility policy is identical to raw comparison; empty numeric displays are skipped.
pub(crate) fn display_key(value: &Value, format: &CellFormat) -> Option<String> {
    let text = match value {
        Value::Number(number) if number.is_finite() => format.format_number(*number),
        Value::Text(text) if !text.is_empty() => crate::value_to_display(value),
        Value::Boolean(_) => crate::value_to_display(value),
        _ => return None,
    };
    (!text.is_empty()).then(|| format!("s:{}", text.to_lowercase()))
}
