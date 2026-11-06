//! 标题、图例、数据标签、坐标轴 → chartEx 元素。其余载荷字段（颜色、字号、空单元格）chartEx 没有对应物，忽略。

use super::model::Kind;
use crate::chart_payload::ChartPayload;
use crate::write::xml::escape;

pub const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex""#;

fn text(tag: &str, text: &str) -> String {
    if text.is_empty() { return String::new(); }
    let attrs = if tag == "title" { r#" pos="t" align="ctr" overlay="0""# } else { "" };
    format!("<cx:title{attrs}><cx:tx><cx:txData><cx:v>{}</cx:v></cx:txData></cx:tx></cx:title>", escape(text))
}

pub fn title(p: &ChartPayload) -> String { text("title", &p.title) }

/// `legend == "none"` 或未知值不写图例。
pub fn legend(p: &ChartPayload) -> String {
    let pos = match p.legend.as_str() { "right" => "r", "bottom" => "b", "top" => "t", "left" => "l", _ => return String::new() };
    format!(r#"<cx:legend pos="{pos}" align="ctr" overlay="0"/>"#)
}

/// 漏斗、树状、旭日图的类别名总是显示，数据标签开关只管数值（同插件）。
pub fn data_labels(kind: Kind, p: &ChartPayload) -> String {
    let names = matches!(kind, Kind::Funnel | Kind::Treemap | Kind::Sunburst);
    if kind == Kind::Boxplot || !(names || p.data_labels) { return String::new(); }
    let pos = if matches!(kind, Kind::Waterfall | Kind::Histogram) { r#" pos="outEnd""# } else { "" };
    format!(r#"<cx:dataLabels{pos}><cx:visibility seriesName="0" categoryName="{}" value="{}"/></cx:dataLabels>"#,
        u8::from(names), u8::from(p.data_labels))
}

pub fn has_axes(kind: Kind) -> bool { matches!(kind, Kind::Waterfall | Kind::Histogram | Kind::Boxplot) }

/// 类别轴 id 0、值轴 id 1（系列的 `cx:axisId` 指向值轴）。
pub fn axes(kind: Kind, p: &ChartPayload) -> String {
    if !has_axes(kind) { return String::new(); }
    let gap = match kind { Kind::Histogram => "0", Kind::Boxplot => "1", _ => "0.5" };
    let limit = |name: &str, value: Option<f64>| value.map(|v| format!(r#" {name}="{v}""#)).unwrap_or_default();
    let scaling = format!("<cx:valScaling{}{}/>", limit("max", p.y_max), limit("min", p.y_min));
    let grid = if p.gridlines { "<cx:majorGridlines/>" } else { "" };
    format!(r#"<cx:axis id="0"><cx:catScaling gapWidth="{gap}"/>{}<cx:tickLabels/></cx:axis><cx:axis id="1">{scaling}{}{grid}<cx:tickLabels/></cx:axis>"#,
        text("axisTitle", &p.x_title), text("axisTitle", &p.y_title))
}
