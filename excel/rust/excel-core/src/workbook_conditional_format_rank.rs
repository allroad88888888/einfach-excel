//! 排名条件的参数校验与阈值缓存；依赖失效交给既有 Rust atom。
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use crate::sheet::ConditionalStatistic;
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Direction {
    Top,
    Bottom,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RankRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    direction: Direction,
    count: u32,
    #[serde(default)]
    percent: bool,
    format: Highlight,
}

pub(crate) struct RankRule {
    count: u32,
    percent: bool,
    bottom: bool,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl RankRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: RankRuleJson = serde_json::from_str(json)
            .map_err(|_| "Use a top/bottom rule with a whole-number rank.")?;
        if rule.kind != "top-bottom" {
            return Err("Expected a top/bottom rule.");
        }
        let max = if rule.percent { 100 } else { 1000 };
        if (!rule.percent && rule.count == 0) || rule.count > max {
            return Err(if rule.percent {
                "Enter a percentage from 0 to 100."
            } else {
                "Enter a number of items from 1 to 1000."
            });
        }
        Ok(Self {
            count: rule.count,
            percent: rule.percent,
            bottom: matches!(rule.direction, Direction::Bottom),
            enabled: rule.enabled,
            style: rule.format.into_style()?,
        })
    }

    pub(super) fn matches(&self, number: f64, threshold: Option<f64>) -> bool {
        self.enabled
            && number.is_finite()
            && threshold.is_some_and(|limit| {
                if self.bottom {
                    number <= limit
                } else {
                    number >= limit
                }
            })
    }
    pub(super) fn statistic(&self) -> ConditionalStatistic {
        ConditionalStatistic::Rank { count: self.count, percent: self.percent, bottom: self.bottom }
    }
}
