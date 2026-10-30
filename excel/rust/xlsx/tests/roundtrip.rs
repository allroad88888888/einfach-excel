use serde_json::Value;

fn to_native(bytes: Vec<u8>) -> Value {
    serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "Book").unwrap()).unwrap()
}

/// 只比较会被转换的内容；单元格按 (sheet, addr) 排序后比较。
fn comparable(file: &Value) -> Value {
    let workbook = &file["workbook"];
    let mut cells = workbook["cells"].as_array().unwrap().clone();
    cells.sort_by_key(|c| (c["sheet"].as_u64(), c["row"].as_u64(), c["col"].as_u64()));
    let mut formats = workbook["formats"].clone();
    for range in formats.as_array_mut().into_iter().flatten() {
        range["cellStyles"].as_array_mut().unwrap().sort_by_key(|s| s["addr"].as_str().unwrap().to_string());
    }
    serde_json::json!({
        "sheets": workbook["sheets"], "cells": cells, "formats": formats,
        "merges": workbook["merges"], "freeze": workbook["freeze"], "sizes": workbook["sizes"],
    })
}

#[test]
fn xlsx_native_xlsx_round_trip_keeps_everything_it_converts() {
    let first = to_native(std::fs::read("tests/fixtures/basic.xlsx").unwrap());
    let bytes = einfach_xlsx::native_to_xlsx(&first.to_string()).unwrap();
    let second = to_native(bytes);
    assert_eq!(comparable(&second), comparable(&first));
}

#[test]
fn exports_native_snapshots_written_by_the_engine() {
    // 引擎快照里会出现 false/0/"default"/null 等"无格式"字段与 rotation 等本 crate 不认识的字段。
    let native = serde_json::json!({
        "format": "einfach-workbook", "version": 1, "title": "Engine",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1, "sheets": [{"idx": 0, "name": "Data & More"}],
            "cells": [
                {"sheet": 0, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "  padded "},
                {"sheet": 0, "addr": "B1", "row": 0, "col": 1, "kind": "formula", "value": "=FILTER(A1:A3,A1:A3<>\"\")"},
                {"sheet": 0, "addr": "C1", "row": 0, "col": 2, "kind": "error", "value": "#N/A"},
            ],
            "formats": [{"sheet": 0, "startRow": 0, "startCol": 0, "endRow": 4294967295u32, "endCol": 4294967295u32,
                "cellStyles": [{"addr": "A1", "format": {
                    "numberFormat": {"kind": "currency", "digits": 2, "symbol": "¥", "pattern": null, "thousands": null},
                    "bold": true, "italic": false, "align": "default", "fontSize": null, "fgColor": null,
                    "strikethrough": false, "indent": 0, "verticalAlign": "default", "rotation": 0}}],
                "rowStyles": [{"index": 0, "format": {}, "height": 28}], "columnStyles": []}],
            "printConfigs": [{"sheet": 0, "revision": 0, "config": {}}],
        }
    });
    let bytes = einfach_xlsx::native_to_xlsx(&native.to_string()).unwrap();
    let back = to_native(bytes);
    let cells = back["workbook"]["cells"].as_array().unwrap();
    assert_eq!(cells[0]["value"], "  padded ");
    assert_eq!(cells[1]["value"], "=FILTER(A1:A3,A1:A3<>\"\")");
    assert_eq!(cells[2]["kind"], "error");
    assert_eq!(back["workbook"]["sheets"][0]["name"], "Data & More");
    let format = &back["workbook"]["formats"][0]["cellStyles"][0]["format"];
    assert_eq!(format["bold"], true);
    assert_eq!(format["numberFormat"]["pattern"], "\"¥\"#,##0.00");
}
