//! 已支持条件规则的分派；未知持久化种类仍由存储层原样保留。
use super::conditional_format_formula::FormulaRule;
use super::conditional_format_numeric::NumericRule;
use super::conditional_format_rank::RankRule;
use crate::cell_style::CellStyle;

pub(crate) enum NativeRule {
    Numeric(NumericRule),
    Formula(FormulaRule),
    Rank(RankRule),
}

impl NativeRule {
    pub(crate) fn parse(json: &str) -> Result<Self, &'static str> {
        let value: serde_json::Value =
            serde_json::from_str(json).map_err(|_| "Enter a valid conditional-format rule.")?;
        match value.get("kind").and_then(|kind| kind.as_str()) {
            Some("cell-value") => NumericRule::parse(json).map(Self::Numeric),
            Some("formula") => FormulaRule::parse(json).map(Self::Formula),
            Some("top-bottom") => RankRule::parse(json).map(Self::Rank),
            _ => Err("This conditional-format kind is not supported yet."),
        }
    }

    pub(crate) fn enabled(&self) -> bool {
        match self {
            Self::Numeric(rule) => rule.enabled,
            Self::Formula(rule) => rule.enabled,
            Self::Rank(rule) => rule.enabled,
        }
    }

    pub(super) fn style(&self) -> &CellStyle {
        match self {
            Self::Numeric(rule) => &rule.style,
            Self::Formula(rule) => &rule.style,
            Self::Rank(rule) => &rule.style,
        }
    }
}
