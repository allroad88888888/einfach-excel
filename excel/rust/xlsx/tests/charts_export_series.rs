//! 图表导出：数据区域 → 逐系列公式（单块、左右拼、上下拼、rows、表头组合、跨表、带引号表名）。

mod common;
use common::*;

fn chart_xml(refs: serde_json::Value, payload: serde_json::Value) -> String {
    export(&native(vec![chart("c", refs, payload)], serde_json::json!({}))).part("xl/charts/chart1.xml")
}

fn formulas(xml: &str) -> Vec<String> {
    xml.split("<c:f>").skip(1).map(|rest| rest.split("</c:f>").next().unwrap().replace("&apos;", "'")).collect()
}

#[test]
fn single_block_columns_with_names_and_categories() {
    let xml = chart_xml(serde_json::json!([range(0, 0, 4, 2, None)]), serde_json::json!({"type": "column"}));
    assert_eq!(formulas(&xml), ["Main!$B$1", "Main!$A$2:$A$5", "Main!$B$2:$B$5", "Main!$C$1", "Main!$A$2:$A$5", "Main!$C$2:$C$5"]);
    assert!(xml.contains(r#"<c:idx val="1"/><c:order val="1"/><c:tx><c:strRef><c:f>Main!$C$1</c:f>"#));
}

#[test]
fn series_in_rows_and_header_combinations() {
    let rows = chart_xml(serde_json::json!([range(0, 0, 2, 3, None)]), serde_json::json!({"seriesIn": "rows"}));
    assert_eq!(formulas(&rows), ["Main!$A$2", "Main!$B$1:$D$1", "Main!$B$2:$D$2", "Main!$A$3", "Main!$B$1:$D$1", "Main!$B$3:$D$3"]);
    let bare = chart_xml(serde_json::json!([range(0, 0, 2, 1, None)]), serde_json::json!({"headerRow": false, "headerCol": false}));
    assert_eq!(formulas(&bare), ["Main!$A$1:$A$3", "Main!$B$1:$B$3"]);
    assert!(!bare.contains("<c:tx>") && !bare.contains("<c:cat>"));
    let no_names = chart_xml(serde_json::json!([range(0, 0, 2, 1, None)]), serde_json::json!({"headerRow": false}));
    assert_eq!(formulas(&no_names), ["Main!$A$1:$A$3", "Main!$B$1:$B$3"]);
}

#[test]
fn side_by_side_and_stacked_blocks() {
    let side = chart_xml(serde_json::json!([range(0, 0, 3, 0, None), range(0, 2, 3, 3, None)]), serde_json::json!({}));
    assert_eq!(formulas(&side), ["Main!$C$1", "Main!$A$2:$A$4", "Main!$C$2:$C$4", "Main!$D$1", "Main!$A$2:$A$4", "Main!$D$2:$D$4"]);
    let stacked = chart_xml(serde_json::json!([range(0, 0, 2, 2, None), range(8, 0, 11, 2, None)]), serde_json::json!({}));
    assert_eq!(formulas(&stacked)[1], "(Main!$A$2:$A$3,Main!$A$9:$A$12)");
    assert_eq!(formulas(&stacked)[2], "(Main!$B$2:$B$3,Main!$B$9:$B$12)");
}

#[test]
fn cross_sheet_references_quote_the_sheet_name() {
    let xml = chart_xml(serde_json::json!([range(0, 0, 4, 1, Some("My Data"))]), serde_json::json!({}));
    assert_eq!(formulas(&xml), ["'My Data'!$B$1", "'My Data'!$A$2:$A$5", "'My Data'!$B$2:$B$5"]);
}

#[test]
fn scatter_uses_first_column_as_x_values() {
    let xml = chart_xml(serde_json::json!([range(0, 0, 4, 2, None)]), serde_json::json!({"type": "scatter"}));
    assert!(xml.contains("<c:xVal><c:numRef><c:f>Main!$A$2:$A$5</c:f>"));
    assert!(xml.contains("<c:yVal><c:numRef><c:f>Main!$C$2:$C$5</c:f>"));
    assert!(!xml.contains("<c:cat>") && !xml.contains("<c:val>"));
    let no_x = chart_xml(serde_json::json!([range(0, 0, 4, 1, None)]), serde_json::json!({"type": "scatter", "headerCol": false}));
    assert!(!no_x.contains("<c:xVal>"));
}

#[test]
fn pie_keeps_only_the_first_series() {
    let xml = chart_xml(serde_json::json!([range(0, 0, 4, 3, None)]), serde_json::json!({"type": "pie"}));
    assert_eq!(xml.matches("<c:ser>").count(), 1);
    assert!(xml.contains("<c:f>Main!$B$2:$B$5</c:f>"));
}
