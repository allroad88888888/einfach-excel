//! 图表数据源（`payload.source`）：导出时按当前的表 / 命名区域取数，refs 里过期的快照被覆盖。

mod common;
use common::*;
use serde_json::{json, Value};

/// 两列六行数据：`sheet` 上 A1:B6（表头 + 5 行）。
fn cells(sheet: u32) -> Vec<Value> {
    let mut out = vec![
        json!({"sheet": sheet, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Month"}),
        json!({"sheet": sheet, "addr": "B1", "row": 0, "col": 1, "kind": "text", "value": "Revenue"}),
    ];
    for row in 1..6u32 {
        out.push(json!({"sheet": sheet, "addr": format!("A{}", row + 1), "row": row, "col": 0, "kind": "text", "value": format!("M{row}")}));
        out.push(json!({"sheet": sheet, "addr": format!("B{}", row + 1), "row": row, "col": 1, "kind": "number", "value": row * 10}));
    }
    out
}

fn table(range: &str) -> Value {
    json!({"name": "Sales", "sheet": "Main", "sheetIndex": 0, "range": range, "hasHeaders": true,
        "hasTotals": false, "columns": ["Month", "Revenue"]})
}

fn chart_part(extra: Value, payload: Value) -> String {
    let stale = json!([range(0, 0, 2, 1, None)]);
    export(&native(vec![chart("c", stale, payload)], extra)).part("xl/charts/chart1.xml")
}

fn formulas(xml: &str) -> Vec<String> {
    xml.split("<c:f>").skip(1).map(|rest| rest.split("</c:f>").next().unwrap().replace("&apos;", "'")).collect()
}

#[test]
fn table_source_overrides_stale_refs_and_fills_caches() {
    let xml = chart_part(json!({"cells": cells(0), "tables": [table("A1:B6")]}), json!({"source": "Sales"}));
    assert_eq!(formulas(&xml), ["Main!$B$1", "Main!$A$2:$A$6", "Main!$B$2:$B$6"]);
    assert!(xml.contains(r#"<c:ptCount val="5"/>"#));
    assert!(xml.contains(r#"<c:pt idx="4"><c:v>50</c:v></c:pt>"#), "{xml}");
}

#[test]
fn table_column_source_excludes_the_totals_row() {
    let mut book = table("A1:B7");
    book["hasTotals"] = json!(true);
    let xml = chart_part(
        json!({"cells": cells(0), "tables": [book]}),
        json!({"source": "Sales[[Month]:[Revenue]]", "headerCol": true}),
    );
    assert_eq!(formulas(&xml), ["Main!$B$1", "Main!$A$2:$A$6", "Main!$B$2:$B$6"]);
}

#[test]
fn defined_name_on_another_sheet_carries_that_sheet_name() {
    let names = json!([{"name": "Trend", "target": {"sheet": 1, "range": [0, 0, 5, 1]}}]);
    let xml = chart_part(json!({"cells": cells(1), "namedRanges": names}), json!({"source": "trend"}));
    assert_eq!(formulas(&xml), ["'My Data'!$B$1", "'My Data'!$A$2:$A$6", "'My Data'!$B$2:$B$6"]);
    assert!(xml.contains(r#"<c:pt idx="4"><c:v>50</c:v></c:pt>"#), "{xml}");
}

#[test]
fn unknown_source_falls_back_to_refs() {
    let xml = chart_part(json!({"cells": cells(0), "tables": [table("A1:B6")]}), json!({"source": "Nope"}));
    assert_eq!(formulas(&xml), ["Main!$B$1", "Main!$A$2:$A$3", "Main!$B$2:$B$3"]);
    let names = json!([{"name": "Calc", "target": null, "formula": "=1+1"}]);
    let xml = chart_part(json!({"cells": cells(0), "namedRanges": names}), json!({"source": "Calc"}));
    assert_eq!(formulas(&xml), ["Main!$B$1", "Main!$A$2:$A$3", "Main!$B$2:$B$3"]);
}
