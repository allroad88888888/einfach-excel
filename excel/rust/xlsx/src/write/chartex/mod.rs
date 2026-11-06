//! 原生 kind=chart（waterfall / funnel / histogram / boxplot / treemap / sunburst）→ `xl/charts/chartExN.xml`。
//! 无效引用、拼不成数据表的区域返回 None，由调用方计入报告 `charts`。

mod anchor;
mod data;
mod elements;
mod model;
mod series;

pub use anchor::{anchor, CONTENT_TYPE, REL_TYPE};
pub use crate::write::cell_values::Cells;

use crate::chart_payload::ChartPayload;
use crate::chartex_totals::total_indices;
use crate::native_drawings::NativeRange;
use model::Kind;

const HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

pub struct Built {
    pub xml: String,
    pub funnel: bool,
}

pub fn is_chartex_type(chart_type: &str) -> bool { Kind::of(chart_type).is_some() }

/// 调用方保证 `payload.type` 是 chartEx 类型（`is_chartex_type`）。
pub fn build(cells: &Cells, payload: &serde_json::Value, refs: &[Option<NativeRange>], own_sheet: &str) -> Option<Built> {
    let p = ChartPayload::from_value(payload);
    let kind = Kind::of(&p.chart_type)?;
    let list = model::build(kind, cells, &p, refs, own_sheet)?;
    // 瀑布图：类别名是「合计」一类的词的那几根画成汇总柱（与插件一致）。
    let subtotals = if kind == Kind::Waterfall {
        let names = list[0].category_names();
        total_indices(names.iter().map(|name| name.as_deref()))
    } else { Vec::new() };
    let body: String = list.iter().enumerate().map(|(id, s)| series::series(kind, id, s, &p, &subtotals)).collect();
    let xml = format!(
        r#"{HEADER}
<cx:chartSpace {}>{}<cx:chart>{}<cx:plotArea><cx:plotAreaRegion>{body}</cx:plotAreaRegion>{}</cx:plotArea>{}</cx:chart></cx:chartSpace>"#,
        elements::NS, data::chart_data(&list), elements::title(&p), elements::axes(kind, &p), elements::legend(&p));
    Some(Built { xml, funnel: kind == Kind::Funnel })
}
