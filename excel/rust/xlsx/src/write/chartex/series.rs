//! `cx:series`：子元素顺序按 schema（tx、dataLabels、dataId、layoutPr）；同 Excel 不写 axisId。

use super::elements::data_labels;
use super::model::{ExSeries, Kind};
use crate::chart_payload::ChartPayload;
use crate::write::xml::escape;

pub fn layout_id(kind: Kind) -> &'static str {
    match kind {
        Kind::Waterfall => "waterfall",
        Kind::Funnel => "funnel",
        // Excel 里直方图是带分箱的 clusteredColumn。
        Kind::Histogram => "clusteredColumn",
        Kind::Boxplot => "boxWhisker",
        Kind::Treemap => "treemap",
        Kind::Sunburst => "sunburst",
    }
}

/// 分箱：Excel 自动分箱用 `binning` 不带箱宽 / 箱数。插件按 Scott 规则分箱，与 Excel 的自动口径
/// 不同（已知差异：两边的箱数、箱边界可能不一样），所以只写自动，不把插件的分箱结果硬写成箱宽。
fn layout_pr(kind: Kind, subtotals: &[usize]) -> String {
    let inner = match kind {
        Kind::Waterfall if !subtotals.is_empty() => format!("<cx:subtotals>{}</cx:subtotals>",
            subtotals.iter().map(|index| format!(r#"<cx:idx val="{index}"/>"#)).collect::<String>()),
        Kind::Histogram => r#"<cx:binning intervalClosed="r"/>"#.into(),
        // 每个系列一个箱：四分位用排除中位数口径，显示平均值标记与离群点（同插件）。
        Kind::Boxplot => r#"<cx:visibility meanLine="0" meanMarker="1" nonoutliers="0" outliers="1"/><cx:statistics quartileMethod="exclusive"/>"#.into(),
        Kind::Treemap => r#"<cx:parentLabelLayout val="overlapping"/>"#.into(),
        _ => return String::new(),
    };
    format!("<cx:layoutPr>{inner}</cx:layoutPr>")
}

pub fn series(kind: Kind, id: usize, s: &ExSeries, p: &ChartPayload, subtotals: &[usize]) -> String {
    let name = s.name.as_ref().map(|(formula, text)| format!(
        "<cx:tx><cx:txData><cx:f>{}</cx:f><cx:v>{}</cx:v></cx:txData></cx:tx>", escape(formula), escape(text))).unwrap_or_default();
    // uniqueId 照 Excel 的写法：序号在前，后半段固定。
    format!(r#"<cx:series layoutId="{}" uniqueId="{{{id:08X}-6F2B-4C3E-9A1D-5E8B2C7F4A10}}">{name}{}<cx:dataId val="{id}"/>{}</cx:series>"#,
        layout_id(kind), data_labels(kind, p), layout_pr(kind, subtotals))
}
