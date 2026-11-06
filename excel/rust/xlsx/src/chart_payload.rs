//! kind=chart 浮动对象的载荷：与 `plugins/plugin-chart/src/core/spec.ts` 的 `ChartSpec` 逐字段对应。
//! 插件 `parseChartSpec` 对缺省或非法字段回落默认值，所以这里读不到的字段一律给默认值，
//! 写出时只写认识的字段。字段增减必须两边同步（插件 README 有字段表）。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChartPayload {
    /// column / bar / line / area / combo / pie / doughnut / scatter /
    /// radar / funnel / waterfall / histogram / boxplot / stock / treemap / sunburst
    #[serde(rename = "type")]
    pub chart_type: String,
    pub title: String,
    /// "columns"：每列一个系列；"rows"：每行一个系列。
    pub series_in: String,
    /// （拼好的数据表里）首行是系列名 / 首列是类别。
    pub header_row: bool,
    pub header_col: bool,
    /// right / bottom / top / left / none
    pub legend: String,
    /// none / stacked / percent
    pub stack: String,
    pub data_labels: bool,
    pub gridlines: bool,
    pub x_title: String,
    pub y_title: String,
    pub y_min: Option<f64>,
    pub y_max: Option<f64>,
    /// 8–24；None 跟随默认 12。
    pub font_size: Option<u32>,
    /// 按系列（饼图、圆环按类别）的 #RRGGBB；None 用主题配色。
    pub colors: Vec<Option<String>>,
    /// 组合图逐系列设置；缺省项按 Excel 默认（最后一个系列是线、在次坐标轴）。
    pub combo: Vec<ComboSeries>,
    /// gap / zero / connect
    pub empty_cells: String,
    pub show_hidden: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ComboSeries {
    /// "column" / "line"；None 按默认。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary: Option<bool>,
}

impl Default for ChartPayload {
    fn default() -> Self {
        Self {
            chart_type: "column".into(),
            title: String::new(),
            series_in: "columns".into(),
            header_row: true,
            header_col: true,
            legend: "right".into(),
            stack: "none".into(),
            data_labels: false,
            gridlines: true,
            x_title: String::new(),
            y_title: String::new(),
            y_min: None,
            y_max: None,
            font_size: None,
            colors: Vec::new(),
            combo: Vec::new(),
            empty_cells: "gap".into(),
            show_hidden: false,
        }
    }
}

impl ChartPayload {
    /// 载荷是插件写的任意 JSON；字段坏了按默认处理，不让整张图丢失。
    pub fn from_value(value: &serde_json::Value) -> Self {
        serde_json::from_value(value.clone()).unwrap_or_default()
    }

    pub fn to_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_else(|_| serde_json::json!({}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_fall_back_to_plugin_defaults() {
        let payload = ChartPayload::from_value(&serde_json::json!({"type": "line", "title": "T"}));
        assert_eq!(payload.chart_type, "line");
        assert_eq!(payload.title, "T");
        assert_eq!(payload.series_in, "columns");
        assert!(payload.header_row && payload.gridlines);
        let json = payload.to_value();
        assert_eq!(json["type"], "line");
        assert_eq!(json["seriesIn"], "columns");
        assert_eq!(json["yMin"], serde_json::Value::Null);
    }
}
