//! 数据条是只读显示几何，不属于可复制、持久化的基础单元格样式。
use super::conditional_color_scale::{unit_position, NumericBounds};
use super::conditional_format_highlight::{enabled_by_default, parse_color};
use serde::{Deserialize, Serialize};
use super::advanced_conditional_format::{NumericDomain, Threshold};
use super::Workbook;
use crate::CellAddress;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DataBarJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    min_color: Option<String>,
    max_color: Option<String>,
    min_threshold: Option<Threshold>,
    max_threshold: Option<Threshold>,
}

pub(crate) struct DataBarRule {
    pub(super) enabled: bool,
    negative: String,
    positive: String,
    low: Threshold,
    high: Threshold,
    automatic_low: bool,
    automatic_high: bool,
    resolved: Option<NumericBounds>,
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
        let automatic_low = rule.min_threshold.is_none();
        let automatic_high = rule.max_threshold.is_none();
        let low = rule.min_threshold.unwrap_or(Threshold::Min);
        let high = rule.max_threshold.unwrap_or(Threshold::Max);
        low.validate()?; high.validate()?;
        Ok(Self { enabled: rule.enabled, negative, positive, low, high,
            automatic_low, automatic_high, resolved: None })
    }

    pub(super) fn resolve(&mut self, domain: &NumericDomain, book: &Workbook, sheet: usize, origin: CellAddress) -> bool {
        self.resolved = self.low.resolve(domain, book, sheet, origin)
            .zip(self.high.resolve(domain, book, sheet, origin))
            .filter(|(min, max)| min <= max)
            .map(|(min, max)| NumericBounds { min, max, median: min });
        self.resolved.is_some()
    }

    pub(super) fn display(&self, value: f64) -> DataBarDisplay {
        let bounds = self.resolved.expect("resolved before projection");
        // Omitted endpoints preserve the existing automatic zero-inclusive scale.
        let min = if self.automatic_low { bounds.min.min(0.0) } else { bounds.min };
        let max = if self.automatic_high { bounds.max.max(0.0) } else { bounds.max };
        let zero = unit_position(0.0, min, max) * 100.0;
        let end = unit_position(value, min, max) * 100.0;
        DataBarDisplay {
            left: zero.min(end), width: (end - zero).abs(),
            axis: (min < 0.0).then_some(zero),
            color: if value < 0.0 { &self.negative } else { &self.positive }.clone(),
        }
    }
}
