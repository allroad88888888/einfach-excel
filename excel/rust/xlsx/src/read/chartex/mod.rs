//! `xl/charts/chartExN.xml`（Office 2016 新图表）→ 图表载荷 + 数据区域。
//! 支持 waterfall / funnel / histogram（clusteredColumn）/ boxplot（boxWhisker）/ treemap / sunburst；
//! 其余（地图、帕累托线等）、字面量数据、外部引用返回 `None`，调用方计入报告 `charts`。

mod elements;
mod hierarchy;
mod model;

use super::charts::series::{join, Joined, SeriesFormulas};
use super::charts::Parsed;
use super::dom;
use crate::chart_payload::ChartPayload;
use crate::chartex_totals::total_indices;
use model::{series_data, Kind, SeriesData};

pub struct ParsedEx {
    pub parsed: Parsed,
    /// 瀑布图 Excel 标成汇总的下标与插件按类别名认出的汇总柱对不上。
    pub subtotals_mismatch: bool,
}

/// `own_sheet`：图表所在工作表的原始名。
pub fn parse(xml: &str, own_sheet: &str) -> Option<ParsedEx> {
    let space = dom::parse(xml, &[])?;
    let chart = space.child("chart")?;
    let region = chart.child("plotArea")?.child("plotAreaRegion")?;
    let chart_data = space.child("chartData")?;
    let mut series = region.each("series").filter(|s| s.attr("layoutId") != Some("paretoLine"));
    let kind = Kind::of(series.next()?.attr("layoutId")?)?;
    let items: Vec<SeriesData> = region.each("series").filter(|s| s.attr("layoutId") != Some("paretoLine"))
        .map(|s| (Kind::of(s.attr("layoutId")?)? == kind).then(|| series_data(s, chart_data)).flatten())
        .collect::<Option<_>>()?;
    // 只有箱线图一个图里有多个系列；别的类型取第一个。
    let items = if kind == Kind::Boxplot { items } else { items.into_iter().take(1).collect() };
    let joined = joined(kind, &items, own_sheet)?;
    let mut payload = ChartPayload {
        chart_type: kind.payload_type().into(),
        series_in: joined.series_in.into(),
        header_row: joined.header_row,
        header_col: joined.header_col,
        ..ChartPayload::default()
    };
    elements::apply(&mut payload, kind, chart, items[0].node);
    let mismatch = kind == Kind::Waterfall && subtotals_mismatch(&items[0]);
    Some(ParsedEx { parsed: Parsed { refs: joined.refs, payload, names_dropped: joined.names_dropped }, subtotals_mismatch: mismatch })
}

fn joined(kind: Kind, items: &[SeriesData], own_sheet: &str) -> Option<Joined> {
    let first = items.first()?;
    if kind.hierarchical() {
        return hierarchy::join(first.cat.as_deref()?, &first.val, first.tx.as_ref(), first.name_lost, own_sheet);
    }
    // 直方图与箱线图在插件里不用类别列。
    let with_cat = matches!(kind, Kind::Waterfall | Kind::Funnel);
    let formulas: Vec<SeriesFormulas> = items.iter().map(|s| SeriesFormulas {
        tx: s.tx.clone(),
        name_lost: s.name_lost,
        cat: if with_cat { s.cat.clone() } else { None },
        val: s.val.clone(),
    }).collect();
    join(&formulas, own_sheet, kind == Kind::Boxplot)
}

/// Excel 的 `cx:subtotals/cx:idx` 与「类别名是合计一类的词」是否同一组下标。
fn subtotals_mismatch(first: &SeriesData) -> bool {
    let mut excel: Vec<usize> = first.node.child("layoutPr").and_then(|pr| pr.child("subtotals"))
        .map(|subtotals| subtotals.each("idx").filter_map(|idx| idx.attr_u32("val").map(|v| v as usize)).collect())
        .unwrap_or_default();
    excel.sort_unstable();
    excel.dedup();
    excel != total_indices(first.cat_names.iter().map(|name| name.as_deref()))
}
