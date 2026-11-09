//! `xl/charts/chartN.xml`（DrawingML chart）→ 图表载荷 + 数据区域。
//! 转换 柱/条/线/面积/饼/圆环/散点/雷达/股价（OHLC）和「柱 + 线」组合；其余、字面量数据、外部引用返回 `None`。

mod analysis;
mod colors;
mod elements;
pub(crate) mod formula;
pub(super) mod series;
mod source;
pub(super) mod tree;
mod types;

use crate::chart_payload::ChartPayload;
use crate::native_drawings::NativeRange;
use crate::read::dom;

pub struct Parsed {
    /// 区域里的表名是 XLSX 里的原始表名（对象所在表为 `None`）。
    pub refs: Vec<NativeRange>,
    pub payload: ChartPayload,
    /// 系列名格还原不了，图表已丢掉系列名。
    pub names_dropped: bool,
}

/// `own_sheet`：图表所在工作表的原始名。
pub fn parse(xml: &str, own_sheet: &str) -> Option<Parsed> {
    let space = dom::parse(xml, &[])?;
    let chart = space.child("chart")?;
    let plot = chart.child("plotArea")?;
    let groups = types::groups(plot)?;
    let (chart_type, stack) = types::resolve(&groups)?;
    let scatter = chart_type == "scatter";

    let mut items = Vec::new();
    for (group, entry) in groups.iter().enumerate() {
        for ser in entry.node.each("ser") {
            let formulas = source::read_series(ser, scatter)?;
            let order = tree::val(ser, &["order"]).and_then(|text| text.trim().parse::<u32>().ok());
            items.push((order.unwrap_or(items.len() as u32), group, ser, formulas));
        }
    }
    items.sort_by_key(|item| item.0);
    let formulas: Vec<_> = items.iter().map(|item| item.3.clone()).collect();
    let joined = series::join(&formulas, own_sheet, scatter)?;

    let secondary = types::secondary_flags(plot, &groups);
    let primary = groups.iter().zip(&secondary).find(|(_, secondary)| !**secondary).map_or(&groups[0], |pair| pair.0);
    let sers: Vec<_> = items.iter().map(|item| item.2).collect();
    let series_groups: Vec<usize> = items.iter().map(|item| item.1).collect();

    let mut payload = ChartPayload {
        chart_type: chart_type.into(),
        series_in: joined.series_in.into(),
        header_row: joined.header_row,
        header_col: joined.header_col,
        stack: stack.into(),
        colors: colors::read(&sers, matches!(chart_type, "pie" | "doughnut")),
        ..ChartPayload::default()
    };
    if chart_type == "stock" {
        payload.colors = colors::stock(groups[0].node);
    }
    if chart_type == "combo" {
        payload.combo = types::combo(&groups, &secondary, &series_groups);
    }
    if matches!(chart_type, "column" | "bar" | "line" | "area" | "scatter" | "combo") {
        analysis::apply(&mut payload, &sers, scatter);
    }
    elements::apply(&mut payload, &space, chart, plot, primary);
    Some(Parsed { refs: joined.refs, payload, names_dropped: joined.names_dropped })
}
