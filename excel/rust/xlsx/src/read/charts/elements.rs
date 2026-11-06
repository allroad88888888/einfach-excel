//! 标题、图例、数据标签、坐标轴、空单元格、隐藏数据、字号 → `ChartPayload` 的对应字段。
//! 读不到的元素保持插件默认值（`ChartPayload::default`）。

use super::tree::{descendants, first_descendant, path, rich_text, val};
use super::types::Group;
use crate::chart_payload::ChartPayload;
use crate::read::dom::Node;

pub fn apply(payload: &mut ChartPayload, space: &Node, chart: &Node, plot: &Node, primary: &Group) {
    payload.title = chart.child("title").map(title_text).unwrap_or_default();
    payload.legend = legend(chart);
    payload.data_labels = descendants(plot, "dLbls").iter().any(|labels| shows_value(labels));
    payload.empty_cells = match chart.child("dispBlanksAs") {
        None => "gap",
        Some(node) => match node.attr("val") {
            Some("gap") => "gap",
            Some("span") => "connect",
            _ => "zero",
        },
    }.into();
    payload.show_hidden = chart.child("plotVisOnly").is_some_and(|node| !node.attr_bool("val", true));
    payload.font_size = space.child("txPr").and_then(|props| first_descendant(props, "defRPr"))
        .and_then(|run| run.attr_u32("sz")).map(|size| (size / 100).clamp(8, 24));
    axes(payload, plot, primary);
}

fn shows_value(labels: &Node) -> bool {
    !labels.child("delete").is_some_and(|node| node.attr_bool("val", true))
        && labels.child("showVal").is_some_and(|node| node.attr_bool("val", true))
}

/// `c:title` 的文字：富文本优先，其次引用缓存。
pub fn title_text(title: &Node) -> String {
    if let Some(rich) = path(title, &["tx", "rich"]) {
        return rich_text(rich);
    }
    path(title, &["tx", "strRef", "strCache"])
        .and_then(|cache| first_descendant(cache, "v"))
        .map(|value| value.text.clone()).unwrap_or_default()
}

fn legend(chart: &Node) -> String {
    let Some(legend) = chart.child("legend") else { return "none".into() };
    match val(legend, &["legendPos"]) {
        Some("b") => "bottom",
        Some("t") => "top",
        Some("l") => "left",
        _ => "right",
    }.into()
}

/// 主坐标轴（按图表组的 `axId` 顺序）：x 取第一根，y 取最后一根值轴。
fn axes(payload: &mut ChartPayload, plot: &Node, primary: &Group) {
    let found: Vec<&Node> = primary.axes.iter().filter_map(|id| {
        plot.children.iter().find(|axis| axis.name.ends_with("Ax") && val(axis, &["axId"]) == Some(*id))
    }).collect();
    let y = found.iter().rev().find(|axis| axis.name == "valAx").copied();
    if let Some(y) = y {
        payload.gridlines = y.child("majorGridlines").is_some();
        payload.y_title = y.child("title").map(title_text).unwrap_or_default();
        payload.y_min = val(y, &["scaling", "min"]).and_then(|text| text.trim().parse().ok());
        payload.y_max = val(y, &["scaling", "max"]).and_then(|text| text.trim().parse().ok());
    }
    if let Some(x) = found.first().filter(|x| !y.is_some_and(|y| std::ptr::eq(**x, y))) {
        payload.x_title = x.child("title").map(title_text).unwrap_or_default();
    }
}
