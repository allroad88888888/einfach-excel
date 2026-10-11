//! 色阶只生成显示填充；阈值来自完整范围的原生统计，不写入 cellStyle。
use super::conditional_format_highlight::{enabled_by_default, parse_color};
use crate::CellStyle;
use einfach_core::Value;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ColorScaleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    min_color: String,
    mid_color: Option<String>,
    max_color: String,
}

pub(crate) struct ColorScaleRule {
    pub(super) enabled: bool,
    min: [u8; 3],
    mid: Option<[u8; 3]>,
    max: [u8; 3],
}

#[derive(Clone, Copy)]
pub(super) struct NumericBounds {
    pub min: f64,
    pub median: f64,
    pub max: f64,
}

impl NumericBounds {
    pub(super) fn from_value(value: &Value) -> Option<Self> {
        let Value::Array(array) = value else { return None; };
        let (Some(Value::Number(min)), Some(Value::Number(median)), Some(Value::Number(max))) =
            (array.get(0, 0), array.get(0, 1), array.get(0, 2)) else { return None; };
        Some(Self { min: *min, median: *median, max: *max })
    }
}

impl ColorScaleRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: ColorScaleJson = serde_json::from_str(json)
            .map_err(|_| "Use two or three valid colors for the color scale.")?;
        if rule.kind != "color-scale" { return Err("Expected a color-scale rule."); }
        Ok(Self { enabled: rule.enabled, min: parse_color(&rule.min_color)?,
            mid: rule.mid_color.as_deref().map(parse_color).transpose()?,
            max: parse_color(&rule.max_color)? })
    }

    pub(super) fn needs_median(&self) -> bool { self.mid.is_some() }

    pub(super) fn style(&self, value: f64, bounds: NumericBounds) -> CellStyle {
        let color = if let Some(mid) = self.mid {
            // 重复的最高值仍使用最高色；中点是数值成员的第 50 百分位。
            if value >= bounds.max { self.max }
            else if value <= bounds.median {
                blend(self.min, mid, unit_position(value, bounds.min, bounds.median))
            } else { blend(mid, self.max, unit_position(value, bounds.median, bounds.max)) }
        } else { blend(self.min, self.max, unit_position(value, bounds.min, bounds.max)) };
        CellStyle { background: Some(Some(format!("#{:02x}{:02x}{:02x}", color[0], color[1], color[2]))),
            ..CellStyle::default() }
    }
}

fn blend(start: [u8; 3], end: [u8; 3], ratio: f64) -> [u8; 3] {
    std::array::from_fn(|index| {
        (f64::from(start[index]) * (1.0 - ratio) + f64::from(end[index]) * ratio).round() as u8
    })
}

/// 极端有限值跨越正负两端时，差值可能溢出；先缩放再求比例。
pub(super) fn unit_position(value: f64, min: f64, max: f64) -> f64 {
    if value <= min || min == max { return 0.0; }
    if value >= max { return 1.0; }
    let span = max - min;
    if span.is_finite() { (value - min) / span }
    else { (value / 2.0 - min / 2.0) / (max / 2.0 - min / 2.0) }
}
