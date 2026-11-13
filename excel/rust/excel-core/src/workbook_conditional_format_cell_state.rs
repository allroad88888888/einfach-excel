//! Preset blank/error classification, independent of display text or base formatting.
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use einfach_core::Value;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Condition { Blank, NotBlank, Error, NotError }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StateJson {
    kind: String,
    condition: Condition,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    format: Highlight,
}

pub(crate) struct CellStateRule {
    condition: Condition,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl CellStateRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: StateJson = serde_json::from_str(json)
            .map_err(|_| "Choose a supported blank or error condition and highlight.")?;
        if rule.kind != "cell-state" {
            return Err("Choose a supported blank or error condition and highlight.");
        }
        Ok(Self { condition: rule.condition, enabled: rule.enabled, style: rule.format.into_style()? })
    }

    pub(super) fn matches(&self, value: Option<&Value>) -> bool {
        let error = matches!(value, Some(Value::Error(_)));
        let blank = match value {
            None | Some(Value::Null) => true,
            // SpreadsheetML blank presets use LEN(TRIM(value)); TRIM only removes ASCII space.
            Some(Value::Text(text)) => text.chars().all(|character| character == ' '),
            _ => false,
        };
        match self.condition {
            Condition::Blank => !error && blank,
            // LEN(TRIM(error)) remains an error, so this is not simply !blank.
            Condition::NotBlank => !error && !blank,
            Condition::Error => error,
            Condition::NotError => !error,
        }
    }
}
