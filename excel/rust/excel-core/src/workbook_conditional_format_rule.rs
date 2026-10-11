//! 已支持条件规则的分派；未知持久化种类仍由存储层原样保留。
use super::conditional_format_formula::FormulaRule;
use super::conditional_format_numeric::NumericRule;
use super::conditional_format_rank::RankRule;
use super::conditional_color_scale::ColorScaleRule;
use super::conditional_data_bar::DataBarRule;
use crate::cell_style::CellStyle;
use crate::sheet::ConditionalStatistic;

pub(crate) enum NativeRule {
    Numeric(NumericRule),
    Formula(FormulaRule),
    Rank(RankRule),
    ColorScale(ColorScaleRule),
    DataBar(DataBarRule),
}

impl NativeRule {
    pub(crate) fn parse(json: &str) -> Result<Self, &'static str> {
        let value: serde_json::Value =
            serde_json::from_str(json).map_err(|_| "Enter a valid conditional-format rule.")?;
        match value.get("kind").and_then(|kind| kind.as_str()) {
            Some("cell-value") => NumericRule::parse(json).map(Self::Numeric),
            Some("formula") => FormulaRule::parse(json).map(Self::Formula),
            Some("top-bottom") => RankRule::parse(json).map(Self::Rank),
            Some("color-scale") => ColorScaleRule::parse(json).map(Self::ColorScale),
            Some("data-bar") => DataBarRule::parse(json).map(Self::DataBar),
            _ => Err("This conditional-format kind is not supported yet."),
        }
    }

    pub(crate) fn enabled(&self) -> bool {
        match self {
            Self::Numeric(rule) => rule.enabled,
            Self::Formula(rule) => rule.enabled,
            Self::Rank(rule) => rule.enabled,
            Self::ColorScale(rule) => rule.enabled,
            Self::DataBar(rule) => rule.enabled,
        }
    }

    pub(super) fn style(&self) -> Option<&CellStyle> {
        match self {
            Self::Numeric(rule) => Some(&rule.style),
            Self::Formula(rule) => Some(&rule.style),
            Self::Rank(rule) => Some(&rule.style),
            Self::ColorScale(_) | Self::DataBar(_) => None,
        }
    }

    pub(super) fn statistic(&self) -> Option<ConditionalStatistic> {
        match self {
            Self::Rank(rule) => Some(rule.statistic()),
            Self::ColorScale(rule) => Some(ConditionalStatistic::Bounds { median: rule.needs_median() }),
            Self::DataBar(_) => Some(ConditionalStatistic::Bounds { median: false }),
            _ => None,
        }
    }
}
