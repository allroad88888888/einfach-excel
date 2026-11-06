//! 一张工作表的浮动对象 → `xl/drawings/drawingN.xml` + 它的 rels + `xl/charts/chartN.xml`。
//! 能写出的图表不计入报告；写不出的图表计 `charts`，其他对象计 `drawings`。

use super::charts::chart_xml;
use super::features::Counters;
use super::package::Part;
use super::rels::Rels;
use super::xml::escape;
use crate::drawing_geometry::{CellCorner, SheetGeometry};
use crate::native::NativeFile;
use crate::native_drawings::CHART_KIND;
use crate::report::ReportBuilder;

const DRAWING_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.drawing+xml";
const CHART_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const NS: &str = r#"xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart""#;

fn corner(tag: &str, c: CellCorner) -> String {
    format!("<xdr:{tag}><xdr:col>{}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{}</xdr:row><xdr:rowOff>{}</xdr:rowOff></xdr:{tag}>",
        c.col, c.col_off_emu, c.row, c.row_off_emu)
}

fn anchor(shape_id: usize, name: &str, from: CellCorner, to: CellCorner, rel_id: &str) -> String {
    format!(r#"<xdr:twoCellAnchor editAs="oneCell">{}{}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="{shape_id}" name="{}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="{rel_id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>"#,
        corner("from", from), corner("to", to), escape(name))
}

/// 返回要拼进工作表尾部的 `<drawing r:id="…"/>`；没有可写出的对象返回空串。
pub fn sheet(
    file: &NativeFile,
    index: usize,
    rels: &mut Rels,
    counters: &mut Counters,
    parts: &mut Vec<Part>,
    report: &mut ReportBuilder,
) -> String {
    let book = &file.workbook;
    let Some(sheet_name) = book.sheets.get(index).map(|meta| meta.name.as_str()) else { return String::new() };
    let geometry = SheetGeometry::from_native(book, index);
    let drawing_no = counters.drawings;
    let mut drawing_rels = Rels::default();
    let mut anchors = String::new();
    let (mut skipped_charts, mut other, mut shape_id) = (0, 0, 1);
    for object in book.drawings.iter().filter(|d| d.sheet == index).flat_map(|d| &d.drawings) {
        if object.kind != CHART_KIND { other += 1; continue; }
        let Some(xml) = chart_xml(&object.payload, &object.refs, sheet_name) else { skipped_charts += 1; continue };
        let chart_no = counters.charts;
        counters.charts += 1;
        parts.push(Part { path: format!("xl/charts/chart{chart_no}.xml"), body: xml, content_type: Some(CHART_CONTENT_TYPE) });
        let rel_id = drawing_rels.add("chart", &format!("../charts/chart{chart_no}.xml"), false);
        let (from, to) = geometry.to_corners(&object.anchor);
        shape_id += 1;
        anchors.push_str(&anchor(shape_id, &object.id, from, to, &rel_id));
    }
    report.add("charts", skipped_charts);
    report.add("drawings", other);
    if drawing_rels.is_empty() { return String::new(); }
    counters.drawings += 1;
    let body = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<xdr:wsDr {NS}>{anchors}</xdr:wsDr>");
    parts.push(Part { path: format!("xl/drawings/drawing{drawing_no}.xml"), body, content_type: Some(DRAWING_CONTENT_TYPE) });
    parts.push(Part { path: format!("xl/drawings/_rels/drawing{drawing_no}.xml.rels"), body: drawing_rels.to_xml(), content_type: None });
    let rel_id = rels.add("drawing", &format!("../drawings/drawing{drawing_no}.xml"), false);
    format!(r#"<drawing r:id="{rel_id}"/>"#)
}

