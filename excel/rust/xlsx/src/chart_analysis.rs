//! 图表载荷里的分析元素：趋势线、误差线。与 `plugins/plugin-chart` 的 `Trendline` / `ErrorBars` 对应。
//! `ChartPayload::from_value` 整体回落默认，所以这里的反序列化辅助函数对坏数据逐项容错：
//! 一条坏趋势线变成 `None`，坏误差线变成 `None`，不拖垮整张图。

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

/// linear / exponential / logarithmic / polynomial / power / movingAverage
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Trendline {
    pub kind: String,
    /// 多项式阶数 2..6。
    pub order: u32,
    /// 移动平均周期 2..255。
    pub period: u32,
    pub show_equation: bool,
    #[serde(rename = "showR2")]
    pub show_r2: bool,
}

impl Default for Trendline {
    fn default() -> Self {
        Self { kind: "linear".into(), order: 2, period: 2, show_equation: false, show_r2: false }
    }
}

/// kind：fixed / percent / stdDev / stdErr；direction：both / plus / minus。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ErrorBars {
    pub kind: String,
    /// 固定值、百分比（5 = 5%）或标准差倍数；标准误差不用。
    pub amount: f64,
    pub direction: String,
}

impl Default for ErrorBars {
    fn default() -> Self {
        Self { kind: "fixed".into(), amount: 1.0, direction: "both".into() }
    }
}

/// 逐项容错：非数组 → 空；坏项 → `None`。
pub fn tolerant_trendlines<'de, D: Deserializer<'de>>(de: D) -> Result<Vec<Option<Trendline>>, D::Error> {
    let value = Value::deserialize(de).unwrap_or(Value::Null);
    Ok(match value {
        Value::Array(items) => items.into_iter().map(|item| serde_json::from_value(item).ok()).collect(),
        _ => Vec::new(),
    })
}

/// 坏数据 → `None`。
pub fn tolerant_error_bars<'de, D: Deserializer<'de>>(de: D) -> Result<Option<ErrorBars>, D::Error> {
    let value = Value::deserialize(de).unwrap_or(Value::Null);
    Ok(serde_json::from_value::<Option<ErrorBars>>(value).ok().flatten())
}

/// 非字符串 → "office"。
pub fn tolerant_palette<'de, D: Deserializer<'de>>(de: D) -> Result<String, D::Error> {
    Ok(match Value::deserialize(de) {
        Ok(Value::String(name)) => name,
        _ => "office".into(),
    })
}

#[cfg(test)]
mod tests {
    use crate::chart_payload::ChartPayload;
    use serde_json::json;

    #[test]
    fn new_fields_use_camel_case_and_defaults() {
        let payload = ChartPayload::from_value(&json!({"type": "line"}));
        assert!(payload.trendlines.is_empty() && payload.error_bars.is_none());
        assert_eq!(payload.palette, "office");
        let json = payload.to_value();
        assert_eq!((json["trendlines"].clone(), json["errorBars"].clone(), json["palette"].clone()),
            (json!([]), json!(null), json!("office")));
        let payload = ChartPayload::from_value(&json!({"trendlines": [{"kind": "polynomial", "showR2": true, "showEquation": true}],
            "errorBars": {"kind": "percent", "amount": 5, "direction": "plus"}, "palette": "warm"}));
        let t = payload.trendlines[0].clone().unwrap();
        assert!(t.show_r2 && t.show_equation && (t.order, t.period) == (2, 2));
        let json = payload.to_value();
        assert_eq!(json["trendlines"][0]["showR2"], true);
        assert_eq!(json["trendlines"][0]["showEquation"], true);
        assert_eq!(json["errorBars"]["direction"], "plus");
    }

    #[test]
    fn malformed_new_fields_do_not_wipe_the_chart() {
        let payload = ChartPayload::from_value(&json!({"type": "bar", "title": "Keep",
            "trendlines": [{"kind": "linear"}, 7, {"kind": "power", "order": "x"}, null, {"kind": "log"}],
            "errorBars": "nope", "palette": 3}));
        assert_eq!((payload.chart_type.as_str(), payload.title.as_str()), ("bar", "Keep"));
        let kinds: Vec<_> = payload.trendlines.iter().map(|t| t.as_ref().map(|t| t.kind.clone())).collect();
        assert_eq!(kinds, [Some("linear".into()), None, None, None, Some("log".into())]);
        assert!(payload.error_bars.is_none());
        assert_eq!(payload.palette, "office");
        let payload = ChartPayload::from_value(&json!({"type": "bar", "trendlines": "x", "errorBars": {"amount": "a"}}));
        assert_eq!(payload.chart_type, "bar");
        assert!(payload.trendlines.is_empty() && payload.error_bars.is_none());
    }
}
