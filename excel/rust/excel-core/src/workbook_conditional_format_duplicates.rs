//! 重复/唯一值比较契约；范围 atom 只缓存重复键，显示读取以二分查找判定。
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use einfach_core::Value;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Mode {
    Duplicate,
    Unique,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DuplicateRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    mode: Mode,
    format: Highlight,
}

pub(crate) struct DuplicateRule {
    unique: bool,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

/// 按计算后的类型和值比较；忽略文本大小写，保留空白，不混淆 1、"1"、TRUE。
/// 真空格和空文本不参加统计；错误、非有限数及非标量值不标记。
pub(crate) fn value_key(value: &Value) -> Option<String> {
    match value {
        Value::Text(text) if !text.is_empty() => Some(format!("t:{}", text.to_lowercase())),
        Value::Number(number) if number.is_finite() => {
            Some(format!("n:{}", if *number == 0.0 { 0.0 } else { *number }))
        }
        Value::Boolean(value) => Some(format!("b:{value}")),
        _ => None,
    }
}

impl DuplicateRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: DuplicateRuleJson = serde_json::from_str(json)
            .map_err(|_| "Choose duplicate or unique values with a supported highlight.")?;
        if rule.kind != "duplicate-values" {
            return Err("Expected a duplicate-values rule.");
        }
        Ok(Self {
            unique: matches!(rule.mode, Mode::Unique),
            enabled: rule.enabled,
            style: rule.format.into_style()?,
        })
    }

    pub(super) fn matches(&self, value: &Value, statistic: &Value) -> bool {
        let (Some(key), Value::Array(keys)) = (value_key(value), statistic) else {
            return false;
        };
        let duplicate = keys
            .data
            .binary_search_by(|value| match value {
                Value::Text(text) => text.as_str().cmp(key.as_str()),
                _ => std::cmp::Ordering::Less,
            })
            .is_ok();
        duplicate != self.unique
    }
}
