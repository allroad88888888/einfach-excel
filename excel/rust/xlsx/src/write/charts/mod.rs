//! 原生 kind=chart 对象 → `xl/charts/chartN.xml`（DrawingML chart）。
//! 不支持的类型、无效引用、拼不成数据表的区域返回 None，由调用方计入报告 `charts`。

mod axes;
mod cartesian;
mod elements;
mod formula;
mod pie;
mod scatter;
mod series;
mod series_xml;

use crate::chart_payload::ChartPayload;
use crate::native_drawings::NativeRange;
use formula::Piece;

const HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

/// `own_sheet` 是对象所在表名，引用缺省表名时用它。
pub fn chart_xml(payload: &serde_json::Value, refs: &[Option<NativeRange>], own_sheet: &str) -> Option<String> {
    let p = ChartPayload::from_value(payload);
    if !matches!(p.chart_type.as_str(), "column" | "bar" | "line" | "area" | "combo" | "pie" | "doughnut" | "scatter") {
        return None;
    }
    let blocks: Vec<Piece> = refs.iter().map(|range| range.as_ref().map(|r| Piece {
        sheet: r.sheet_name.clone().unwrap_or_else(|| own_sheet.to_string()),
        start_row: r.start_row.min(r.end_row), end_row: r.start_row.max(r.end_row),
        start_col: r.start_col.min(r.end_col), end_col: r.start_col.max(r.end_col),
    })).collect::<Option<_>>()?;
    let series = series::split(&blocks, p.series_in == "rows", p.header_row, p.header_col)?;
    if series.is_empty() { return None; }
    let plot = match p.chart_type.as_str() {
        "pie" | "doughnut" => pie::plot(&p, &series),
        "scatter" => scatter::plot(&p, &series),
        _ => cartesian::plot(&p, &series),
    };
    Some(format!(
        r#"{HEADER}
<c:chartSpace {}><c:roundedCorners val="0"/><c:chart>{}{}<c:plotArea><c:layout/>{plot}</c:plotArea>{}{}</c:chart>{}</c:chartSpace>"#,
        elements::NS, elements::title(&p.title), elements::auto_title_deleted(&p),
        elements::legend(&p), elements::disp_blanks(&p), elements::font_size(&p)
    ))
}
