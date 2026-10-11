//! 已支持条件规则的分派；未知持久化种类仍由存储层原样保留。
use super::conditional_color_scale::ColorScaleRule;
use super::conditional_data_bar::DataBarRule;
use super::conditional_format_duplicates::DuplicateRule;
use super::conditional_format_formula::FormulaRule;
use super::conditional_format_numeric::NumericRule;
use super::conditional_format_rank::RankRule;
use super::conditional_format_text::TextRule;
use crate::cell_style::CellStyle;
use crate::sheet::ConditionalStatistic;

pub(crate) enum NativeRuleKind {
    Numeric(NumericRule),
    Formula(FormulaRule),
    Rank(RankRule),
    ColorScale(ColorScaleRule),
    DataBar(DataBarRule),
    Text(TextRule),
    Duplicates(DuplicateRule),
}

pub(crate) struct NativeRule {
    pub(super) kind: NativeRuleKind,
    pub(super) stop_if_true: bool,
}

impl NativeRule {
    pub(crate) fn parse(json: &str) -> Result<Self, &'static str> {
        let mut value: serde_json::Value =
            serde_json::from_str(json).map_err(|_| "Enter a valid conditional-format rule.")?;
        let fields = value
            .as_object_mut()
            .ok_or("Enter a valid conditional-format rule.")?;
        let stop_if_true = match fields.remove("stopIfTrue") {
            None => false,
            Some(serde_json::Value::Bool(value)) => value,
            _ => return Err("Stop if true must be a boolean."),
        };
        let json = value.to_string();
        let kind = match value.get("kind").and_then(|kind| kind.as_str()) {
            Some("cell-value") => NumericRule::parse(&json).map(NativeRuleKind::Numeric),
            Some("formula") => FormulaRule::parse(&json).map(NativeRuleKind::Formula),
            Some("top-bottom") => RankRule::parse(&json).map(NativeRuleKind::Rank),
            Some("color-scale") => ColorScaleRule::parse(&json).map(NativeRuleKind::ColorScale),
            Some("data-bar") => DataBarRule::parse(&json).map(NativeRuleKind::DataBar),
            Some("text") => TextRule::parse(&json).map(NativeRuleKind::Text),
            Some("duplicate-values") => DuplicateRule::parse(&json).map(NativeRuleKind::Duplicates),
            _ => Err("This conditional-format kind is not supported yet."),
        }?;
        if stop_if_true
            && matches!(
                kind,
                NativeRuleKind::ColorScale(_) | NativeRuleKind::DataBar(_)
            )
        {
            return Err("Stop if true is available only for highlight rules.");
        }
        Ok(Self { kind, stop_if_true })
    }

    pub(crate) fn enabled(&self) -> bool {
        match &self.kind {
            NativeRuleKind::Numeric(rule) => rule.enabled,
            NativeRuleKind::Formula(rule) => rule.enabled,
            NativeRuleKind::Rank(rule) => rule.enabled,
            NativeRuleKind::ColorScale(rule) => rule.enabled,
            NativeRuleKind::DataBar(rule) => rule.enabled,
            NativeRuleKind::Text(rule) => rule.enabled,
            NativeRuleKind::Duplicates(rule) => rule.enabled,
        }
    }

    pub(super) fn style(&self) -> Option<&CellStyle> {
        match &self.kind {
            NativeRuleKind::Numeric(rule) => Some(&rule.style),
            NativeRuleKind::Formula(rule) => Some(&rule.style),
            NativeRuleKind::Rank(rule) => Some(&rule.style),
            NativeRuleKind::Text(rule) => Some(&rule.style),
            NativeRuleKind::Duplicates(rule) => Some(&rule.style),
            NativeRuleKind::ColorScale(_) | NativeRuleKind::DataBar(_) => None,
        }
    }

    pub(super) fn statistic(&self) -> Option<ConditionalStatistic> {
        match &self.kind {
            NativeRuleKind::Rank(rule) => Some(rule.statistic()),
            NativeRuleKind::ColorScale(rule) => Some(ConditionalStatistic::Bounds {
                median: rule.needs_median(),
            }),
            NativeRuleKind::DataBar(_) => Some(ConditionalStatistic::Bounds { median: false }),
            NativeRuleKind::Duplicates(_) => Some(ConditionalStatistic::Duplicates),
            _ => None,
        }
    }
}
