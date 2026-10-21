//! 文本条件只比较文本（含公式结果），不把数字或空格强制转换成文本。
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use serde::Deserialize;
use super::advanced_formatting::TextWildcard;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Operator {
    Contains,
    NotContains,
    BeginsWith,
    EndsWith,
    MatchesWildcard,
    NotMatchesWildcard,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TextRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    condition: Operator,
    text: String,
    format: Highlight,
}

pub(crate) struct TextRule {
    operator: Operator,
    text: String,
    wildcard: Option<TextWildcard>,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl TextRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: TextRuleJson = serde_json::from_str(json)
            .map_err(|_| "Use a text rule with a supported condition and highlight.")?;
        if rule.kind != "text" || rule.text.is_empty() || rule.text.chars().count() > 1024 {
            return Err("Enter text between 1 and 1024 characters.");
        }
        Ok(Self {
            wildcard: if matches!(rule.condition, Operator::MatchesWildcard | Operator::NotMatchesWildcard) {
                Some(TextWildcard::new(&rule.text)?)
            } else { None },
            operator: rule.condition,
            text: rule.text.to_lowercase(),
            enabled: rule.enabled,
            style: rule.format.into_style()?,
        })
    }

    /// Four literal operations retain their original semantics; wildcard rules match whole values.
    pub(super) fn matches(&self, text: &str) -> bool {
        if let Some(wildcard) = &self.wildcard {
            return wildcard.matches(text).is_ok_and(|matched| {
                matched != matches!(self.operator, Operator::NotMatchesWildcard)
            });
        }
        let text = text.to_lowercase();
        match self.operator {
            Operator::Contains => text.contains(&self.text),
            Operator::NotContains => !text.contains(&self.text),
            Operator::BeginsWith => text.starts_with(&self.text),
            Operator::EndsWith => text.ends_with(&self.text),
            Operator::MatchesWildcard | Operator::NotMatchesWildcard => unreachable!("compiled wildcard"),
        }
    }
}
