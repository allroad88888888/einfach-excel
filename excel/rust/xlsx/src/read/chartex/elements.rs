//! chartEx 的标题、图例、数据标签、坐标轴 → `ChartPayload`。读不到的保持插件默认值。

use super::model::Kind;
use crate::chart_payload::ChartPayload;
use crate::read::charts::tree::{path, rich_text};
use crate::read::dom::Node;

fn title_text(title: &Node) -> String {
    let Some(tx) = title.child("tx") else { return String::new() };
    if let Some(value) = path(tx, &["txData", "v"]) {
        return value.text.clone();
    }
    tx.child("rich").map(rich_text).unwrap_or_default()
}

fn legend(chart: &Node) -> &'static str {
    let Some(legend) = chart.child("legend") else { return "none" };
    match legend.attr("pos") {
        Some("b") => "bottom",
        Some("t") => "top",
        Some("l") => "left",
        _ => "right",
    }
}

fn shows_value(series: &Node) -> bool {
    let Some(labels) = series.child("dataLabels") else { return false };
    labels.child("visibility").is_none_or(|visibility| visibility.attr_bool("value", false))
}

fn limit(scaling: &Node, name: &str) -> Option<f64> {
    scaling.attr_f64(name).filter(|value| value.is_finite())
}

pub fn apply(payload: &mut ChartPayload, kind: Kind, chart: &Node, first_series: &Node) {
    payload.title = chart.child("title").map(title_text).unwrap_or_default();
    payload.legend = legend(chart).into();
    payload.data_labels = shows_value(first_series);
    if !kind.has_axes() { return; }
    let Some(plot) = chart.child("plotArea") else { return };
    if let Some(y) = plot.each("axis").find(|axis| axis.child("valScaling").is_some()) {
        payload.gridlines = y.child("majorGridlines").is_some();
        payload.y_title = y.child("title").map(title_text).unwrap_or_default();
        if let Some(scaling) = y.child("valScaling") {
            payload.y_min = limit(scaling, "min");
            payload.y_max = limit(scaling, "max");
        }
    }
    if let Some(x) = plot.each("axis").find(|axis| axis.child("catScaling").is_some()) {
        payload.x_title = x.child("title").map(title_text).unwrap_or_default();
    }
}
