//! `c:ser`：子元素顺序按 ECMA-376（各图表类型的序列各不相同）。

use super::elements::{color_at, solid};
use super::series::SeriesRefs;
use crate::chart_payload::ChartPayload;
use crate::write::xml::escape;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SerKind { Bar, Line, Area, Pie, Scatter, Radar, Stock }

fn str_ref(tag: &str, formula: &str) -> String {
    format!("<c:{tag}><c:strRef><c:f>{}</c:f></c:strRef></c:{tag}>", escape(formula))
}

fn num_ref(tag: &str, formula: &str) -> String {
    format!("<c:{tag}><c:numRef><c:f>{}</c:f></c:numRef></c:{tag}>", escape(formula))
}

/// 序列的 `c:spPr`（柱、面积是填充；折线是线条；散点不画线）。
fn sp_pr(kind: SerKind, color: Option<&str>) -> String {
    match (kind, color) {
        // 股价图的四个系列只提供数据，线条由高低线和涨跌柱代替。
        (SerKind::Scatter | SerKind::Stock, _) => r#"<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>"#.into(),
        (SerKind::Line | SerKind::Radar, Some(color)) => format!(r#"<c:spPr><a:ln w="28575" cap="rnd">{}<a:round/></a:ln></c:spPr>"#, solid(color)),
        (SerKind::Pie, _) | (_, None) => String::new(),
        (_, Some(color)) => format!("<c:spPr>{}</c:spPr>", solid(color)),
    }
}

fn marker(kind: SerKind, color: Option<&str>) -> String {
    match (kind, color) {
        (SerKind::Scatter, Some(color)) => format!(r#"<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>{}</c:spPr></c:marker>"#, solid(color)),
        (SerKind::Scatter, None) => r#"<c:marker><c:symbol val="circle"/><c:size val="7"/></c:marker>"#.into(),
        (SerKind::Radar, Some(color)) => format!(r#"<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>{}</c:spPr></c:marker>"#, solid(color)),
        (SerKind::Radar, None) => r#"<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>"#.into(),
        (SerKind::Stock, _) => r#"<c:marker><c:symbol val="none"/></c:marker>"#.into(),
        _ => String::new(),
    }
}

/// 饼图、圆环按类别上色。
fn data_points(p: &ChartPayload) -> String {
    (0..p.colors.len())
        .filter_map(|i| Some(format!(r#"<c:dPt><c:idx val="{i}"/><c:bubble3D val="0"/><c:spPr>{}</c:spPr></c:dPt>"#, solid(&color_at(p, i)?))))
        .collect()
}

/// `index` 是序列在整张图里的序号（也是 `c:order`）；颜色按它取。
pub fn ser(kind: SerKind, index: usize, refs: &SeriesRefs, p: &ChartPayload) -> String {
    let color = if kind == SerKind::Pie { None } else { color_at(p, index) };
    let mut xml = format!(r#"<c:ser><c:idx val="{index}"/><c:order val="{index}"/>"#);
    if let Some(name) = &refs.name { xml.push_str(&str_ref("tx", name)); }
    xml.push_str(&sp_pr(kind, color.as_deref()));
    match kind {
        SerKind::Bar => xml.push_str(r#"<c:invertIfNegative val="0"/>"#),
        SerKind::Line | SerKind::Scatter | SerKind::Radar | SerKind::Stock => xml.push_str(&marker(kind, color.as_deref())),
        SerKind::Pie => xml.push_str(&data_points(p)),
        SerKind::Area => {}
    }
    if kind == SerKind::Scatter {
        if let Some(cat) = &refs.cat { xml.push_str(&num_ref("xVal", cat)); }
        xml.push_str(&num_ref("yVal", &refs.val));
        xml.push_str(r#"<c:smooth val="0"/>"#);
    } else {
        if let Some(cat) = &refs.cat { xml.push_str(&str_ref("cat", cat)); }
        xml.push_str(&num_ref("val", &refs.val));
        if matches!(kind, SerKind::Line | SerKind::Stock) { xml.push_str(r#"<c:smooth val="0"/>"#); }
    }
    xml.push_str("</c:ser>");
    xml
}
