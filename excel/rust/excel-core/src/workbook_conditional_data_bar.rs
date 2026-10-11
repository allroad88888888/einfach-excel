//! 数据条是只读显示几何，不属于可复制、持久化的基础单元格样式。
use super::conditional_color_scale::{unit_position, NumericBounds};
use super::conditional_format_highlight::{enabled_by_default, parse_color};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DataBarJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    min_color: Option<String>,
    max_color: Option<String>,
}

pub(crate) struct DataBarRule {
    pub(super) enabled: bool,
    negative: String,
    positive: String,
}

/// 百分比坐标完全由 Rust 决定；视图仅应用 CSS 单位并绘制。
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DataBarDisplay {
    pub left: f64,
    pub width: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis: Option<f64>,
    pub color: String,
}

impl DataBarRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: DataBarJson = serde_json::from_str(json)
            .map_err(|_| "Use valid positive and negative data-bar colors.")?;
        if rule.kind != "data-bar" { return Err("Expected a data-bar rule."); }
        let negative = rule.min_color.unwrap_or_else(|| "#f8696b".into());
        let positive = rule.max_color.unwrap_or_else(|| "#638ec6".into());
        parse_color(&negative)?;
        parse_color(&positive)?;
        Ok(Self { enabled: rule.enabled, negative, positive })
    }

    pub(super) fn display(&self, value: f64, bounds: NumericBounds) -> DataBarDisplay {
        let min = bounds.min.min(0.0);
        let max = bounds.max.max(0.0);
        let zero = unit_position(0.0, min, max) * 100.0;
        let end = unit_position(value, min, max) * 100.0;
        DataBarDisplay {
            left: zero.min(end), width: (end - zero).abs(),
            axis: (min < 0.0).then_some(zero),
            color: if value < 0.0 { &self.negative } else { &self.positive }.clone(),
        }
    }
}
