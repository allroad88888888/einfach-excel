//! 雷达图、股价图的导出 / 导入，以及导出时写入的缓存值（strCache / numCache）。
//! 导入样本 tests/fixtures/charts_more.xlsx 由 make_chart_fixtures.py 生成。

mod chart_import_support;
mod common;

use serde_json::json;

fn data() -> serde_json::Value {
    json!([common::range(0, 0, 4, 2, Some("My Data"))])
}

fn chart_xml(payload: serde_json::Value, refs: serde_json::Value) -> String {
    let out = common::export(&common::native(vec![common::chart("c", refs, payload)], json!({})));
    assert!(out.report.items.is_empty(), "{:?}", out.report.items);
    out.part("xl/charts/chart1.xml")
}

#[test]
fn radar_is_a_marker_radar_chart_with_category_and_value_axes() {
    let xml = chart_xml(json!({"type": "radar", "legend": "bottom"}), data());
    assert!(xml.contains(r#"<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>"#), "{xml}");
    assert_eq!(xml.matches("<c:ser>").count(), 2);
    assert!(xml.contains("<c:catAx>") && xml.contains("<c:valAx>"));
    assert!(xml.contains("<c:majorGridlines/>"));
    assert!(xml.contains(r#"<c:legendPos val="b"/>"#));
    // 雷达系列没有 smooth。
    assert!(!xml.contains("<c:smooth"));
    assert!(xml.contains("<c:cat><c:strRef><c:f>'My Data'!$A$2:$A$5</c:f>"));
}

#[test]
fn stock_has_four_invisible_series_hi_low_lines_and_up_down_bars() {
    let refs = json!([common::range(0, 0, 4, 4, Some("My Data"))]);
    let xml = chart_xml(json!({"type": "stock", "colors": ["#00FF00"]}), refs);
    assert!(xml.contains("<c:stockChart><c:ser>"), "{xml}");
    assert_eq!(xml.matches("<c:ser>").count(), 4);
    assert_eq!(xml.matches(r#"<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>"#).count(), 4);
    assert!(xml.contains("<c:hiLowLines>"));
    assert!(xml.contains(r#"<c:upDownBars><c:gapWidth val="150"/><c:upBars><c:spPr><a:solidFill><a:srgbClr val="00FF00"/>"#), "{xml}");
    // 跌用缺省红色。
    assert!(xml.contains(r#"<c:downBars><c:spPr><a:solidFill><a:srgbClr val="D64545"/>"#), "{xml}");
    assert!(xml.contains("<c:catAx>") && xml.contains("<c:valAx>"));
    assert!(xml.find("</c:stockChart>").unwrap() < xml.find("<c:catAx>").unwrap());
}

#[test]
fn stock_without_exactly_four_series_is_not_written_and_is_reported() {
    for last_col in [3, 5] {
        let refs = json!([common::range(0, 0, 4, last_col, Some("My Data"))]);
        let out = common::export(&common::native(vec![common::chart("c", refs, json!({"type": "stock"}))], json!({})));
        assert_eq!(out.report_kinds(), [("charts".to_string(), 1)], "series count {}", last_col);
        assert!(!out.has_part("xl/charts/chart1.xml"));
    }
}

fn cell(sheet: usize, row: u32, col: u32, kind: &str, value: serde_json::Value) -> serde_json::Value {
    json!({"sheet": sheet, "row": row, "col": col, "kind": kind, "value": value,
        "addr": format!("{}{}", (b'A' + col as u8) as char, row + 1)})
}

#[test]
fn formulas_get_cached_values_for_names_categories_and_numbers() {
    let cells = json!([
        cell(1, 0, 0, "text", json!("Region")), cell(1, 0, 1, "text", json!("Q1")),
        cell(1, 1, 0, "text", json!("North & <South>")), cell(1, 1, 1, "number", json!(3.5)),
        cell(1, 2, 0, "text", json!("East")), cell(1, 2, 1, "formula", json!(8.0)),
        cell(1, 3, 0, "number", json!(2024)), cell(1, 3, 1, "formula", serde_json::Value::Null),
        cell(1, 4, 0, "text", json!("West")), cell(1, 4, 1, "number", json!(1)),
        // 主表上同名的单元格不能被串用。
        cell(0, 1, 1, "number", json!(99)),
    ]);
    let refs = json!([common::range(0, 0, 4, 1, Some("My Data"))]);
    let json = common::native(vec![common::chart("c", refs, json!({"type": "column"}))], json!({"cells": cells}));
    let xml = common::export(&json).part("xl/charts/chart1.xml");
    assert!(xml.contains(r#"<c:tx><c:strRef><c:f>'My Data'!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Q1</c:v></c:pt></c:strCache></c:strRef></c:tx>"#), "{xml}");
    assert!(xml.contains(r#"<c:strCache><c:ptCount val="4"/><c:pt idx="0"><c:v>North &amp; &lt;South&gt;</c:v></c:pt><c:pt idx="1"><c:v>East</c:v></c:pt><c:pt idx="2"><c:v>2024</c:v></c:pt><c:pt idx="3"><c:v>West</c:v></c:pt></c:strCache>"#), "{xml}");
    // 没有缓存值的公式格（idx 2）跳过，有缓存值的（idx 1）保留。
    assert!(xml.contains(r#"<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>3.5</c:v></c:pt><c:pt idx="1"><c:v>8</c:v></c:pt><c:pt idx="3"><c:v>1</c:v></c:pt></c:numCache>"#), "{xml}");
}

#[test]
fn unions_are_cached_in_reference_order_and_unknown_sheets_get_no_cache() {
    let cells = json!([cell(1, 1, 1, "number", json!(1)), cell(1, 2, 1, "number", json!(2)), cell(1, 4, 1, "number", json!(5))]);
    let refs = json!([common::range(1, 1, 2, 1, Some("My Data")), common::range(4, 1, 4, 1, Some("My Data"))]);
    let json = common::native(vec![common::chart("c", refs, json!({"type": "line", "headerRow": false, "headerCol": false}))], json!({"cells": cells}));
    let xml = common::export(&json).part("xl/charts/chart1.xml");
    assert!(xml.contains(r#"<c:f>('My Data'!$B$2:$B$3,'My Data'!$B$5)</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt><c:pt idx="2"><c:v>5</c:v></c:pt>"#), "{xml}");
}

#[test]
fn radar_is_imported_with_its_data_block_and_colors() {
    let book = chart_import_support::import("tests/fixtures/charts_more.xlsx");
    let radar = book.drawings(0);
    assert_eq!(radar.len(), 1);
    let payload = &radar[0]["payload"];
    assert_eq!(payload["type"], "radar");
    assert_eq!(payload["title"], "Skills");
    assert_eq!((payload["headerRow"].as_bool(), payload["headerCol"].as_bool()), (Some(true), Some(true)));
    assert_eq!(payload["colors"][0], "#FF0000");
    assert_eq!(chart_import_support::refs(radar[0]), [(0, 0, 4, 2, None)]);
}

#[test]
fn ohlc_stock_is_imported_and_other_stock_variants_are_skipped_and_counted() {
    let book = chart_import_support::import("tests/fixtures/charts_more.xlsx");
    let stock = book.drawings(1);
    assert_eq!(stock.len(), 1);
    assert_eq!(stock[0]["payload"]["type"], "stock");
    assert_eq!(stock[0]["payload"]["headerCol"], true);
    assert_eq!(chart_import_support::refs(stock[0]), [(0, 0, 4, 4, None)]);
    // 缺省红绿不当作自定义颜色保留。
    assert_eq!(stock[0]["payload"]["colors"], json!([]));
    // 高低收（3 个系列）与带成交量（柱 + 股价）两种变体跳过。
    assert!(book.drawings(2).is_empty());
    assert_eq!(book.report_items(), [("charts", 2)]);
}
