//! 浮动对象尚不写入 XLSX：导出报告必须逐类列出，单元格内容照常导出。

fn native(drawings: serde_json::Value) -> String {
    let anchor = serde_json::json!({"row": 0, "col": 3, "offsetX": 0, "offsetY": 0,
        "width": 480, "height": 288});
    let chart = |id: &str| serde_json::json!({"id": id, "kind": "chart", "anchor": anchor,
        "refs": [{"startRow": 0, "startCol": 0, "endRow": 4, "endCol": 1, "sheetName": "Data"}],
        "payload": {"type": "column", "title": "Sales"}});
    let drawings = if drawings.is_null() {
        serde_json::json!([
            {"sheet": 0, "drawings": [chart("chart-1"), chart("chart-2")]},
            {"sheet": 1, "drawings": [{"id": "logo", "kind": "image", "anchor": anchor}]},
        ])
    } else {
        drawings
    };
    serde_json::json!({
        "format": "einfach-workbook", "version": 1, "title": "Charts",
        "canvases": [{"rowCount": 100, "colCount": 20}, {"rowCount": 100, "colCount": 20}],
        "workbook": {
            "version": 1,
            "sheets": [{"idx": 0, "name": "Main"}, {"idx": 1, "name": "Data"}],
            "cells": [{"sheet": 1, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Region"}],
            "drawings": drawings,
        }
    })
    .to_string()
}

#[test]
fn charts_and_other_objects_are_reported_as_not_exported() {
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native(serde_json::Value::Null))
        .unwrap();
    let kinds: Vec<_> = report.items.iter().map(|i| (i.kind.as_str(), i.count)).collect();
    assert_eq!(kinds, [("charts", 2), ("drawings", 1)]);
    assert!(report.summary.starts_with(
        "Download requested. Not exported to Excel: charts, images or drawings"),
        "{}", report.summary);
    // 单元格照常写出，打开导出的文件不报浮动对象。
    let back: serde_json::Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "Charts").unwrap()).unwrap();
    assert_eq!(back["workbook"]["cells"][0]["value"], "Region");
    assert!(back["workbook"].get("drawings").is_none());
}

#[test]
fn workbooks_without_objects_report_nothing_for_drawings() {
    let (_, report) = einfach_xlsx::native_to_xlsx_with_report(&native(serde_json::json!([])))
        .unwrap();
    assert!(report.items.is_empty(), "{:?}", report.items);
}
