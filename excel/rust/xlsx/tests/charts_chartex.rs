//! Office 2016 新图表（chartEx）：导出的 XML、导出 → 导入往返、Excel 风格样例的导入与报告。

mod common;

use serde_json::{json, Value};

fn text(v: &str) -> Value { json!(v) }

/// 在 (row, col) 起按行铺一张表（数字写 number，其余 text）。
fn put(cells: &mut Vec<Value>, row: u32, col: u32, table: &[&[&str]]) {
    for (r, line) in table.iter().enumerate() {
        for (c, value) in line.iter().enumerate() {
            let (kind, v) = match value.parse::<f64>() { Ok(n) => ("number", json!(n)), Err(_) => ("text", text(value)) };
            let (row, col) = (row + r as u32, col + c as u32);
            cells.push(json!({"sheet": 0, "row": row, "col": col, "kind": kind, "value": v,
                "addr": format!("{}{}", (b'A' + col as u8) as char, row + 1)}));
        }
    }
}

fn cells() -> Vec<Value> {
    let mut cells = Vec::new();
    // A1:B8 瀑布 / 漏斗：下标 3（Subtotal）和 5（总计）是汇总柱。
    put(&mut cells, 0, 0, &[&["Item", "Amount"], &["Start", "100"], &["Up", "30"], &["Down", "-20"], &["Subtotal", "110"],
        &["More", "15"], &["总计", "125"]]);
    // H1:J7 层级：Region / City / Sales
    put(&mut cells, 0, 7, &[&["Region", "City", "Sales"], &["North", "Oslo", "10"], &["North", "Bergen", "5"],
        &["South", "Rome", "8"], &["South", "Milan", "7"], &["East", "Kyiv", "3"]]);
    // L1:L8 直方图原始数值
    put(&mut cells, 0, 11, &[&["Score"], &["1"], &["2"], &["2"], &["3"], &["3"], &["9"], &["4"]]);
    // N1:P7 箱线图：三个系列
    put(&mut cells, 0, 13, &[&["A", "B", "C"], &["1", "2", "3"], &["2", "3", "5"], &["3", "4", "8"], &["4", "5", "9"], &["30", "6", "10"]]);
    cells
}

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> Value {
    json!({"startRow": r0, "startCol": c0, "endRow": r1, "endCol": c1})
}

fn chart(id: &str, refs: Value, payload: Value) -> Value {
    json!({"id": id, "kind": "chart", "refs": refs, "payload": payload,
        "anchor": {"row": 1, "col": 17, "offsetX": 4, "offsetY": 3, "width": 480, "height": 288}})
}

/// 六种类型各一张；载荷里写出的字段往返后必须一致。
fn six() -> Vec<Value> {
    vec![
        chart("wf", json!([range(0, 0, 6, 1)]), json!({"type": "waterfall", "title": "Bridge", "legend": "bottom", "dataLabels": true, "gridlines": false, "yMin": -10.0, "yMax": 200.0})),
        chart("fn", json!([range(0, 0, 6, 1)]), json!({"type": "funnel", "title": "Funnel", "legend": "right"})),
        chart("hi", json!([range(0, 11, 7, 11)]), json!({"type": "histogram", "headerCol": false, "legend": "none", "dataLabels": true})),
        chart("bx", json!([range(0, 13, 5, 15)]), json!({"type": "boxplot", "headerCol": false, "legend": "top", "title": "Spread"})),
        chart("tm", json!([range(0, 7, 5, 9)]), json!({"type": "treemap", "legend": "none", "dataLabels": true})),
        chart("sb", json!([range(0, 7, 5, 9)]), json!({"type": "sunburst", "legend": "left", "title": "Sun"})),
    ]
}

fn native(drawings: Vec<Value>) -> String {
    json!({"format": "einfach-workbook", "version": 1, "title": "ChartEx",
        "canvases": [{"rowCount": 100, "colCount": 30}],
        "workbook": {"version": 1, "sheets": [{"idx": 0, "name": "Main"}], "cells": cells(),
            "drawings": [{"sheet": 0, "drawings": drawings}]}}).to_string()
}

#[test]
fn exports_chartex_parts_with_content_type_relationship_and_alternate_content() {
    let out = common::export(&native(six()));
    assert!(out.report_kinds().is_empty(), "{:?}", out.report_kinds());
    for n in 1..=6 {
        assert!(out.has_part(&format!("xl/charts/chartEx{n}.xml")), "chartEx{n}");
        assert!(out.part("[Content_Types].xml").contains(&format!(r#"PartName="/xl/charts/chartEx{n}.xml" ContentType="application/vnd.ms-office.chartex+xml""#)));
        assert!(out.part("xl/drawings/_rels/drawing1.xml.rels").contains(&format!(r#"Type="http://schemas.microsoft.com/office/2014/relationships/chartEx" Target="../charts/chartEx{n}.xml""#)));
    }
    let drawing = out.part("xl/drawings/drawing1.xml");
    assert_eq!(drawing.matches("<mc:AlternateContent").count(), 6);
    assert_eq!(drawing.matches(r#"uri="http://schemas.microsoft.com/office/drawing/2014/chartex""#).count(), 6);
    assert!(drawing.contains(r#"Requires="cx1""#) && drawing.contains(r#"Requires="cx2""#), "funnel uses cx2");
    assert!(drawing.contains("<mc:Fallback>"));
    assert!(out.part("xl/charts/chartEx1.xml").starts_with("<?xml"));
}

#[test]
fn waterfall_writes_subtotal_indices_from_total_category_names() {
    let xml = common::export(&native(six())).part("xl/charts/chartEx1.xml");
    assert!(xml.contains(r#"<cx:series layoutId="waterfall">"#), "{xml}");
    assert!(xml.contains(r#"<cx:subtotals><cx:idx val="3"/><cx:idx val="5"/></cx:subtotals>"#), "{xml}");
    assert!(xml.contains(r#"<cx:strDim type="cat"><cx:f>Main!$A$2:$A$7</cx:f><cx:lvl ptCount="6"><cx:pt idx="0">Start</cx:pt>"#), "{xml}");
    assert!(xml.contains(r#"<cx:numDim type="val"><cx:f>Main!$B$2:$B$7</cx:f><cx:lvl ptCount="6" formatCode="General"><cx:pt idx="0">100</cx:pt><cx:pt idx="1">30</cx:pt><cx:pt idx="2">-20</cx:pt>"#), "{xml}");
    assert!(xml.contains("<cx:f>Main!$B$1</cx:f><cx:v>Amount</cx:v>"), "{xml}");
    assert!(xml.contains(r#"<cx:title pos="t" align="ctr" overlay="0"><cx:tx><cx:txData><cx:v>Bridge</cx:v>"#), "{xml}");
    assert!(xml.contains(r#"<cx:legend pos="b""#) && xml.contains(r#"<cx:dataLabels pos="outEnd">"#), "{xml}");
    assert!(xml.contains(r#"<cx:valScaling max="200" min="-10"/>"#) && !xml.contains("majorGridlines"), "{xml}");
    assert!(xml.contains("<cx:dataId val=\"0\"/><cx:layoutPr>") && xml.contains(r#"<cx:axisId val="1"/>"#), "{xml}");
}

#[test]
fn other_types_use_the_excel_layout_ids_and_options() {
    let out = common::export(&native(six()));
    let funnel = out.part("xl/charts/chartEx2.xml");
    assert!(funnel.contains(r#"layoutId="funnel""#) && !funnel.contains("<cx:axis "), "{funnel}");
    let hist = out.part("xl/charts/chartEx3.xml");
    assert!(hist.contains(r#"layoutId="clusteredColumn""#) && hist.contains(r#"<cx:binning intervalClosed="r"/>"#), "{hist}");
    assert!(!hist.contains("strDim") && hist.contains("<cx:f>Main!$L$2:$L$8</cx:f>"), "{hist}");
    let boxplot = out.part("xl/charts/chartEx4.xml");
    assert_eq!(boxplot.matches("<cx:series ").count(), 3, "one box per series");
    assert_eq!(boxplot.matches("<cx:data id=").count(), 3);
    assert!(boxplot.contains(r#"<cx:statistics quartileMethod="exclusive"/>"#) && boxplot.contains(r#"meanMarker="1""#) && boxplot.contains(r#"outliers="1""#), "{boxplot}");
    assert!(boxplot.contains("<cx:dataId val=\"2\"/>") && boxplot.contains("<cx:f>Main!$P$1</cx:f>"), "{boxplot}");
}

#[test]
fn hierarchy_charts_use_one_multi_column_category_formula() {
    let out = common::export(&native(six()));
    for (n, layout) in [(5, "treemap"), (6, "sunburst")] {
        let xml = out.part(&format!("xl/charts/chartEx{n}.xml"));
        assert!(xml.contains(&format!(r#"layoutId="{layout}""#)), "{xml}");
        assert!(xml.contains(r#"<cx:strDim type="cat"><cx:f>Main!$H$2:$I$6</cx:f><cx:lvl ptCount="5"><cx:pt idx="0">Oslo</cx:pt>"#), "innermost level first: {xml}");
        assert!(xml.contains(r#"<cx:lvl ptCount="5"><cx:pt idx="0">North</cx:pt>"#), "{xml}");
        assert!(xml.contains(r#"<cx:numDim type="size"><cx:f>Main!$J$2:$J$6</cx:f>"#), "{xml}");
        assert!(xml.contains("<cx:f>Main!$J$1</cx:f><cx:v>Sales</cx:v>"), "{xml}");
    }
}

#[test]
fn round_trip_keeps_type_regions_and_elements() {
    let source = six();
    let (bytes, export) = einfach_xlsx::native_to_xlsx_with_report(&native(source.clone())).unwrap();
    assert!(export.items.is_empty());
    let (text, import) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Round trip").unwrap();
    assert!(import.items.is_empty(), "import report: {:?}", import.items);
    let back: Value = serde_json::from_str(&text).unwrap();
    let drawings = back["workbook"]["drawings"][0]["drawings"].as_array().unwrap();
    assert_eq!(drawings.len(), 6);
    for expected in &source {
        let id = expected["id"].as_str().unwrap();
        let actual = drawings.iter().find(|d| d["id"] == *id).unwrap_or_else(|| panic!("{id} missing"));
        assert_eq!(actual["refs"], expected["refs"], "{id}: refs");
        for (key, value) in expected["payload"].as_object().unwrap() {
            assert_eq!(&actual["payload"][key], value, "{id}: payload field {key}");
        }
        assert_eq!(actual["anchor"], expected["anchor"], "{id}: anchor");
    }
}

#[test]
fn unsupported_layouts_are_reported_as_skipped_charts() {
    // 层级图按行排列、区域对不上都写不出，计入 charts，其余图照常导出。
    let rows_treemap = chart("bad", json!([range(0, 7, 5, 9)]), json!({"type": "treemap", "seriesIn": "rows"}));
    let out = common::export(&native(vec![rows_treemap, six().remove(0)]));
    assert_eq!(out.report_kinds(), vec![("charts".to_string(), 1)]);
    assert!(out.has_part("xl/charts/chartEx1.xml") && !out.has_part("xl/charts/chartEx2.xml"));
}

mod excel_style {
    use super::*;
    use serde_json::Value;

    fn import() -> (Value, Vec<(String, usize)>) {
        let bytes = std::fs::read("tests/fixtures/chartex_excel_style.xlsx").expect("fixture exists");
        let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Book").unwrap();
        (serde_json::from_str(&text).unwrap(), report.items.iter().map(|i| (i.kind.clone(), i.count)).collect())
    }

    #[test]
    fn imports_waterfall_and_histogram_and_skips_the_literal_funnel() {
        let (file, report) = import();
        let drawings = file["workbook"]["drawings"][0]["drawings"].as_array().unwrap();
        assert_eq!(drawings.len(), 2, "{drawings:?}");
        let by_id = |id: &str| drawings.iter().find(|d| d["id"] == id).unwrap();
        let wf = by_id("wf");
        assert_eq!(wf["refs"], json!([range(0, 0, 5, 1)]));
        let p = &wf["payload"];
        assert_eq!((p["type"].as_str(), p["title"].as_str(), p["legend"].as_str()), (Some("waterfall"), Some("Excel waterfall"), Some("bottom")));
        assert_eq!((p["headerRow"].as_bool(), p["headerCol"].as_bool(), p["dataLabels"].as_bool()), (Some(true), Some(true), Some(true)));
        let hist = by_id("hist");
        assert_eq!(hist["refs"], json!([range(0, 3, 6, 3)]));
        assert_eq!((hist["payload"]["type"].as_str(), hist["payload"]["headerCol"].as_bool()), (Some("histogram"), Some(false)));
        // 帕累托线系列忽略；字面量漏斗跳过；Excel 的汇总下标 0、4 与类别名 Total（下标 3）对不上。
        assert_eq!(report, vec![("charts".to_string(), 1), ("chartSubtotals".to_string(), 1)]);
    }
}

/// 手动生成给 Excel 打开核对的示例：`CHARTEX_SAMPLE=/path/chartex.xlsx cargo test --test charts_chartex write_sample -- --ignored`
#[test]
#[ignore]
fn write_sample() {
    let Ok(path) = std::env::var("CHARTEX_SAMPLE") else { return };
    let mut drawings = six();
    for (i, drawing) in drawings.iter_mut().enumerate() {
        drawing["anchor"] = json!({"row": 1 + 17 * i as u32, "col": 17, "offsetX": 0, "offsetY": 0, "width": 560, "height": 320});
    }
    let (bytes, _) = einfach_xlsx::native_to_xlsx_with_report(&native(drawings)).unwrap();
    std::fs::write(path, bytes).unwrap();
}
