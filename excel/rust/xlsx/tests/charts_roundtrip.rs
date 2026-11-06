//! 原生 → XLSX → 原生：支持的图表类型、各种区域布局与元素在往返后保持一致。

use serde_json::{json, Value};

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> Value {
    json!({"startRow": r0, "startCol": c0, "endRow": r1, "endCol": c1})
}

fn chart(id: &str, row: u32, refs: Value, payload: Value) -> Value {
    json!({"id": id, "kind": "chart", "refs": refs, "payload": payload,
        "anchor": {"row": row, "col": 6, "offsetX": 4, "offsetY": 3, "width": 480, "height": 288}})
}

fn workbook(drawings: Value) -> String {
    let mut cells = Vec::new();
    for (row, values) in [["Region", "Q1", "Q2", "Q3"], ["North", "3", "5", "2"], ["South", "4", "1", "6"],
        ["East", "2", "7", "3"], ["West", "5", "2", "4"]].iter().enumerate() {
        for (col, value) in values.iter().enumerate() {
            let (kind, value): (&str, Value) = match value.parse::<f64>() {
                Ok(number) => ("number", json!(number)),
                Err(_) => ("text", json!(value)),
            };
            for sheet in [0, 1] {
                cells.push(json!({"sheet": sheet, "row": row, "col": col, "kind": kind, "value": value,
                    "addr": format!("{}{}", (b'A' + col as u8) as char, row + 1)}));
            }
        }
    }
    json!({"format": "einfach-workbook", "version": 1, "title": "Round trip",
        "canvases": [{"rowCount": 200, "colCount": 30}, {"rowCount": 200, "colCount": 30}],
        "workbook": {"version": 1, "sheets": [{"idx": 0, "name": "Main"}, {"idx": 1, "name": "Sales data"}],
            "cells": cells, "drawings": drawings}}).to_string()
}

fn round_trip(drawings: Value) -> (Value, Vec<(String, usize)>) {
    let (bytes, export) = einfach_xlsx::native_to_xlsx_with_report(&workbook(drawings)).unwrap();
    assert!(export.items.is_empty(), "export report: {:?}", export.items);
    let (text, import) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Round trip").unwrap();
    let back: Value = serde_json::from_str(&text).unwrap();
    let report = import.items.iter().map(|item| (item.kind.clone(), item.count)).collect();
    (back["workbook"]["drawings"].clone(), report)
}

/// 插件会对缺省字段回落默认值，所以只比较原载荷里写出的字段。
fn assert_payload_subset(expected: &Value, actual: &Value, id: &str) {
    // 末尾的 null 颜色等同于用主题色，不要求逐位保留。
    let trim = |value: &Value| match value.as_array() {
        Some(items) => {
            let end = items.iter().rposition(|item| !item.is_null()).map_or(0, |at| at + 1);
            Value::Array(items[..end].to_vec())
        }
        None => value.clone(),
    };
    for (key, value) in expected.as_object().unwrap() {
        let (expected, actual) = if key == "colors" { (trim(value), trim(&actual[key])) } else { (value.clone(), actual[key].clone()) };
        assert_eq!(actual, expected, "{id}: payload field {key}");
    }
}

#[test]
fn supported_charts_survive_an_xlsx_round_trip() {
    let main = vec![
        chart("columns", 0, json!([range(0, 0, 4, 3)]), json!({"type": "column", "title": "Sales",
            "legend": "bottom", "dataLabels": true, "gridlines": false, "xTitle": "Region", "yTitle": "Units",
            "yMin": 0.0, "yMax": 10.0, "emptyCells": "zero", "showHidden": true})),
        chart("stacked-bar", 16, json!([range(0, 0, 4, 2)]), json!({"type": "bar", "stack": "stacked",
            "legend": "top"})),
        chart("percent-area", 32, json!([range(0, 0, 4, 3)]), json!({"type": "area", "stack": "percent",
            "legend": "none"})),
        chart("by-rows", 48, json!([range(0, 0, 4, 3)]), json!({"type": "line", "seriesIn": "rows",
            "legend": "left"})),
        chart("two-areas", 64, json!([range(0, 0, 4, 0), range(0, 2, 4, 3)]), json!({"type": "column"})),
        chart("pie", 80, json!([range(0, 0, 4, 1)]), json!({"type": "pie",
            "colors": ["#FF0000", null, "#00FF00", null]})),
        chart("ring", 96, json!([range(0, 0, 4, 1)]), json!({"type": "doughnut", "dataLabels": true})),
        chart("xy", 112, json!([range(1, 1, 4, 2)]), json!({"type": "scatter", "headerRow": false})),
        chart("combo", 128, json!([range(0, 0, 4, 3)]), json!({"type": "combo",
            "combo": [{"kind": "column", "secondary": false}, {"kind": "line", "secondary": false},
                {"kind": "line", "secondary": true}]})),
        chart("colors", 144, json!([range(0, 0, 4, 2)]), json!({"type": "column",
            "colors": ["#123456", "#ABCDEF"], "fontSize": 14})),
        chart("radar", 160, json!([range(0, 0, 4, 3)]), json!({"type": "radar", "title": "Skills",
            "legend": "bottom", "gridlines": false, "dataLabels": true})),
        // 开盘、最高、最低、收盘 四列，没有类别列。
        chart("stock", 176, json!([range(0, 0, 4, 3)]), json!({"type": "stock", "headerCol": false,
            "colors": ["#112233", "#445566"], "legend": "none"})),
    ];
    let other = vec![
        chart("cross", 0, json!([{"startRow": 0, "startCol": 0, "endRow": 4, "endCol": 2,
            "sheetName": "Main"}]), json!({"type": "line", "title": "Other sheet"})),
    ];
    let original = json!([{"sheet": 0, "drawings": main}, {"sheet": 1, "drawings": [] }]);
    let mut with_cross = original.clone();
    with_cross[1]["drawings"] = json!(other);
    let (back, report) = round_trip(with_cross.clone());
    assert!(report.is_empty(), "import report: {report:?}");

    for (sheet, expected_list) in [(0, main), (1, other)] {
        let actual_list = back.as_array().unwrap().iter()
            .find(|entry| entry["sheet"] == sheet).unwrap()["drawings"].as_array().unwrap().clone();
        assert_eq!(actual_list.len(), expected_list.len(), "sheet {sheet} object count");
        for (expected, actual) in expected_list.iter().zip(&actual_list) {
            let id = expected["id"].as_str().unwrap();
            assert_eq!(actual["id"], expected["id"]);
            assert_eq!(actual["kind"], "chart");
            assert_eq!(actual["anchor"], expected["anchor"], "{id}: anchor");
            assert_eq!(actual["refs"], expected["refs"], "{id}: refs");
            assert_payload_subset(&expected["payload"], &actual["payload"], id);
        }
    }
}
