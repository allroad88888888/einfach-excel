//! Mean comparisons share the native range statistic and never scan a UI window.
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Direction { Above, Below }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AverageJson {
    kind: String,
    direction: Direction,
    #[serde(default)]
    equal_average: bool,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    format: Highlight,
}

pub(crate) struct AverageRule {
    below: bool,
    equal: bool,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl AverageRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: AverageJson = serde_json::from_str(json)
            .map_err(|_| "Choose a supported average comparison and highlight.")?;
        if rule.kind != "above-average" {
            return Err("Choose a supported average comparison and highlight.");
        }
        Ok(Self { below: matches!(rule.direction, Direction::Below),
            equal: rule.equal_average, enabled: rule.enabled, style: rule.format.into_style()? })
    }

    pub(super) fn matches(&self, number: f64, mean: Option<f64>) -> bool {
        number.is_finite() && mean.is_some_and(|mean| {
            (self.equal && number == mean) || if self.below { number < mean } else { number > mean }
        })
    }
}
