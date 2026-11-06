//! 柱 / 条 / 折线 / 面积 / 组合：图组（barChart、lineChart、areaChart）与坐标轴。

use super::axes::{cat_axis, val_axis, CatAxis, ValAxis};
use super::elements::data_labels;
use super::series::SeriesRefs;
use super::series_xml::{ser, SerKind};
use crate::chart_payload::ChartPayload;

const PRIMARY: (u32, u32) = (1001, 1002);
const SECONDARY: (u32, u32) = (1003, 1004);

/// 每个系列落在哪种图组、哪组坐标轴；与插件 `comboSeriesKind` 同一套默认值。
fn placements(p: &ChartPayload, count: usize) -> Vec<(SerKind, bool)> {
    let single = match p.chart_type.as_str() { "line" => SerKind::Line, "area" => SerKind::Area, _ => SerKind::Bar };
    if p.chart_type != "combo" { return vec![(single, false); count]; }
    let mut out: Vec<(SerKind, bool)> = (0..count).map(|index| {
        let last = count > 1 && index == count - 1;
        let option = p.combo.get(index);
        let kind = match option.and_then(|o| o.kind.as_deref()) {
            Some("line") => SerKind::Line,
            Some(_) => SerKind::Bar,
            None if last => SerKind::Line,
            None => SerKind::Bar,
        };
        (kind, option.and_then(|o| o.secondary).unwrap_or(last))
    }).collect();
    // 全部在次轴时主轴没有图组，Excel 不接受空的主轴：退回主轴。
    if out.iter().all(|&(_, secondary)| secondary) {
        out.iter_mut().for_each(|slot| slot.1 = false);
    }
    out
}

fn grouping(p: &ChartPayload, kind: SerKind) -> &'static str {
    let stacked = p.chart_type != "combo";
    match (kind == SerKind::Bar, if stacked { p.stack.as_str() } else { "none" }) {
        (true, "stacked") => "stacked",
        (true, "percent") => "percentStacked",
        (true, _) => "clustered",
        (false, "stacked") => "stacked",
        (false, "percent") => "percentStacked",
        (false, _) => "standard",
    }
}

fn group(p: &ChartPayload, kind: SerKind, items: &[(usize, &SeriesRefs)], axes: (u32, u32)) -> String {
    let grouping = grouping(p, kind);
    let sers: String = items.iter().map(|&(index, refs)| ser(kind, index, refs, p)).collect();
    let ax = format!(r#"<c:axId val="{}"/><c:axId val="{}"/>"#, axes.0, axes.1);
    let labels = data_labels(p);
    match kind {
        SerKind::Bar => {
            let dir = if p.chart_type == "bar" { "bar" } else { "col" };
            let overlap = if grouping == "clustered" { "" } else { r#"<c:overlap val="100"/>"# };
            format!(r#"<c:barChart><c:barDir val="{dir}"/><c:grouping val="{grouping}"/><c:varyColors val="0"/>{sers}{labels}<c:gapWidth val="150"/>{overlap}{ax}</c:barChart>"#)
        }
        SerKind::Line => format!(r#"<c:lineChart><c:grouping val="{grouping}"/><c:varyColors val="0"/>{sers}{labels}<c:marker val="1"/>{ax}</c:lineChart>"#),
        _ => format!(r#"<c:areaChart><c:grouping val="{grouping}"/><c:varyColors val="0"/>{sers}{labels}{ax}</c:areaChart>"#),
    }
}

/// plotArea 的内容（图组 + 坐标轴）。
pub fn plot(p: &ChartPayload, series: &[SeriesRefs]) -> String {
    let placed = placements(p, series.len());
    let horizontal = p.chart_type == "bar";
    let mut xml = String::new();
    let mut has_secondary = false;
    for secondary in [false, true] {
        for kind in [SerKind::Bar, SerKind::Line, SerKind::Area] {
            let items: Vec<(usize, &SeriesRefs)> = series.iter().enumerate()
                .filter(|&(index, _)| placed[index] == (kind, secondary)).collect();
            if items.is_empty() { continue; }
            has_secondary |= secondary;
            xml.push_str(&group(p, kind, &items, if secondary { SECONDARY } else { PRIMARY }));
        }
    }
    let (cat_pos, val_pos) = if horizontal { ("l", "b") } else { ("b", "l") };
    xml.push_str(&cat_axis(&CatAxis { id: PRIMARY.0, cross: PRIMARY.1, pos: cat_pos, title: &p.x_title, deleted: false }));
    xml.push_str(&val_axis(&ValAxis { id: PRIMARY.1, cross: PRIMARY.0, pos: val_pos, title: &p.y_title,
        min: p.y_min, max: p.y_max, gridlines: p.gridlines, crosses_max: false, between_mid: false }));
    if has_secondary {
        xml.push_str(&cat_axis(&CatAxis { id: SECONDARY.0, cross: SECONDARY.1, pos: cat_pos, title: "", deleted: true }));
        xml.push_str(&val_axis(&ValAxis { id: SECONDARY.1, cross: SECONDARY.0, pos: if horizontal { "t" } else { "r" }, title: "",
            min: None, max: None, gridlines: false, crosses_max: true, between_mid: false }));
    }
    xml
}
