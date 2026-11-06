//! `c:plotArea` 里的各 `c:*Chart` 图表组 → 插件的 type / stack / 组合图设置。
//! 不认识的组（雷达、股价、气泡、曲面、饼中饼……）返回 `None`，整张图表跳过。

use super::tree::val;
use crate::chart_payload::ComboSeries;
use crate::read::dom::Node;

pub struct Group<'a> {
    pub node: &'a Node,
    /// column / bar / line / area / pie / doughnut / scatter
    pub chart_type: &'static str,
    /// none / stacked / percent
    pub stack: &'static str,
    pub axes: Vec<&'a str>,
}

/// plotArea 下所有图表组；有任何一组不支持则整体 `None`。
pub fn groups(plot: &Node) -> Option<Vec<Group<'_>>> {
    let groups: Vec<Group> = plot.children.iter().filter(|n| n.name.ends_with("Chart"))
        .map(group).collect::<Option<_>>()?;
    (!groups.is_empty()).then_some(groups)
}

fn group(node: &Node) -> Option<Group<'_>> {
    let chart_type = match node.name.as_str() {
        "barChart" | "bar3DChart" => if val(node, &["barDir"]) == Some("bar") { "bar" } else { "column" },
        "lineChart" | "line3DChart" => "line",
        "areaChart" | "area3DChart" => "area",
        "pieChart" | "pie3DChart" => "pie",
        "doughnutChart" => "doughnut",
        "scatterChart" => "scatter",
        _ => return None,
    };
    let stack = match val(node, &["grouping"]) {
        Some("stacked") => "stacked",
        Some("percentStacked") => "percent",
        _ => "none",
    };
    let axes = node.each("axId").filter_map(|id| id.attr("val")).collect();
    Some(Group { node, chart_type, stack, axes })
}

/// 整张图的 (type, stack)。多个组只认「柱/条 + 线」的组合（插件的 combo）。
pub fn resolve(groups: &[Group]) -> Option<(&'static str, &'static str)> {
    if groups.len() == 1 {
        return Some((groups[0].chart_type, groups[0].stack));
    }
    if !groups.iter().all(|g| matches!(g.chart_type, "column" | "bar" | "line")) {
        return None;
    }
    let stack = groups.iter().find(|g| g.chart_type != "line").map_or("none", |g| g.stack);
    Some(("combo", stack))
}

/// 每个组是否画在次坐标轴：优先看 `crosses=max` 的值轴，其次看是否与第一组用不同的轴。
pub fn secondary_flags(plot: &Node, groups: &[Group]) -> Vec<bool> {
    let secondary_axes: Vec<&str> = plot.each("valAx")
        .filter(|axis| val(axis, &["crosses"]) == Some("max"))
        .filter_map(|axis| val(axis, &["axId"])).collect();
    groups.iter().map(|g| {
        if secondary_axes.is_empty() {
            g.axes != groups[0].axes
        } else {
            g.axes.iter().any(|id| secondary_axes.contains(id))
        }
    }).collect()
}

/// `series_groups[i]` 是第 i 个系列（按绘制顺序）所在的组下标。
pub fn combo(groups: &[Group], secondary: &[bool], series_groups: &[usize]) -> Vec<ComboSeries> {
    series_groups.iter().map(|&index| ComboSeries {
        kind: Some(if groups[index].chart_type == "line" { "line" } else { "column" }.into()),
        secondary: Some(secondary[index]),
    }).collect()
}
