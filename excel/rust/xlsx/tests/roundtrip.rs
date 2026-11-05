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
        "hyperlinks": workbook["hyperlinks"], "notes": workbook["notes"], "tables": workbook["tables"],
        "hidden": workbook["hidden"], "hiddenColumns": workbook["hiddenColumns"],
        "conditionalFormats": workbook["conditionalFormats"], "dataValidations": workbook["dataValidations"],
        "namedRanges": workbook["namedRanges"],
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
fn features_survive_xlsx_native_xlsx_round_trip() {
    let first = to_native(std::fs::read("tests/fixtures/features.xlsx").unwrap());
    // 先确认样本里这些字段都真的有内容，避免两边同为空时的假通过。
    for key in ["hyperlinks", "notes", "tables", "hidden", "hiddenColumns", "conditionalFormats", "dataValidations", "namedRanges"] {
        assert!(!first["workbook"][key].as_array().unwrap().is_empty(), "{key} should be converted");
    }
    let bytes = einfach_xlsx::native_to_xlsx(&first.to_string()).unwrap();
    let second = to_native(bytes);
    assert_eq!(comparable(&second), comparable(&first));
}

#[test]
fn exports_notes_threads_and_skips_what_xlsx_cannot_hold() {
    let native = serde_json::json!({
        "format": "einfach-workbook", "version": 1, "title": "F",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1, "sheets": [{"idx": 0, "name": "S"}], "cells": [],
            "notes": [{"sheet": 0, "row": 0, "col": 0, "text": "plain note"}],
            "comments": [
                {"sheet": 0, "row": 0, "col": 0, "thread": {"resolved": false, "entries": [{"kind": "message", "author": "Z", "body": "ignored", "createdAt": 1}]}},
                {"sheet": 0, "row": 1, "col": 0, "thread": {"resolved": false, "entries": [
                    {"kind": "message", "author": "Ann", "body": "hi", "createdAt": 1},
                    {"kind": "message", "author": "Bob", "body": "yo", "createdAt": 2}]}}],
            "dataValidations": [{"sheet": 0, "regions": [
                {"range": [0, 0, 4, 0], "rule": {"kind": "list", "items": ["a,b", "c"], "ignoreBlank": true}},
                {"range": [0, 1, 4, 1], "rule": {"kind": "list", "items": ["a", "b"], "ignoreBlank": true}}]}],
            "conditionalFormats": [{"sheet": 0, "revision": 3, "rules": [
                {"id": "x", "scope": {"range": {"rowStart": 0, "rowEnd": 3, "colStart": 0, "colEnd": 0}}, "priority": 0,
                 "rule": {"kind": "icon-set", "iconSet": "3-arrows"}},
                {"id": "y", "scope": {"range": {"rowStart": 0, "rowEnd": 3, "colStart": 0, "colEnd": 0}}, "priority": 1,
                 "enabled": false, "rule": {"kind": "duplicate-values", "mode": "duplicate", "enabled": false, "format": {"bold": true}}}]}],
            "namedRanges": [{"name": "Gone", "target": null}],
        }
    });
    let back = to_native(einfach_xlsx::native_to_xlsx(&native.to_string()).unwrap());
    let notes = &back["workbook"]["notes"];
    assert_eq!(notes[0]["text"], "plain note");
    assert_eq!(notes[1]["text"], "Ann: hi\nBob: yo");
    assert_eq!(back["workbook"]["dataValidations"][0]["regions"].as_array().unwrap().len(), 1);
    assert_eq!(back["workbook"]["dataValidations"][0]["regions"][0]["range"], serde_json::json!([0, 1, 4, 1]));
    assert!(back["workbook"].get("conditionalFormats").is_none());
    assert!(back["workbook"].get("namedRanges").is_none(), "a #REF! name has nothing to import");
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
            "calculationMode": "manual",
        }
    });
    let bytes = einfach_xlsx::native_to_xlsx(&native.to_string()).unwrap();
    let back = to_native(bytes);
    let cells = back["workbook"]["cells"].as_array().unwrap();
    assert_eq!(cells[0]["value"], "  padded ");
    assert_eq!(cells[1]["value"], "=FILTER(A1:A3,A1:A3<>\"\")");
    assert_eq!(cells[2]["kind"], "error");
    assert_eq!(back["workbook"]["sheets"][0]["name"], "Data & More");
    assert_eq!(back["workbook"]["calculationMode"], "manual");
    let format = &back["workbook"]["formats"][0]["cellStyles"][0]["format"];
    assert_eq!(format["bold"], true);
    assert_eq!(format["numberFormat"]["pattern"], "\"¥\"#,##0.00");
}

#[test]
fn reports_dropped_and_downgraded_features_on_export() {
    let native = serde_json::json!({
        "format": "einfach-workbook", "version": 1, "title": "ExportReport",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1,
            "sheets": [{"idx": 0, "name": "S", "hidden": true, "tabColor": "#ff0000"}],
            "cells": [],
            "comments": [{"sheet": 0, "row": 0, "col": 0, "thread": {"resolved": false, "entries": [
                {"kind": "message", "author": "Ann", "body": "hi", "createdAt": 1}]}}],
            "conditionalFormats": [{"sheet": 0, "revision": 1, "rules": [
                {"id": "1", "scope": {"range": {"rowStart": 0, "rowEnd": 1, "colStart": 0, "colEnd": 0}}, "priority": 0,
                 "rule": {"kind": "icon-set", "iconSet": "3-arrows"}}]}],
            "dataValidations": [{"sheet": 0, "regions": [
                {"range": [0, 0, 1, 0], "rule": {"kind": "list", "items": ["a,b"], "ignoreBlank": true}}]}],
            "namedRanges": [{"name": "Broken", "target": null}],
            "tables": [{"name": "BadTable", "sheet": "S", "sheetIndex": 0, "range": "A1:B2", "columns": ["OnlyOne"]}],
            "formats": [{"sheet": 0, "startRow": 0, "startCol": 0, "endRow": 10, "endCol": 10,
                "cellStyles": [{"addr": "A1", "format": {"rotation": 45}}],
                "rowStyles": [{"index": 0, "format": {"bold": true}}],
                "columnStyles": []}],
            "protection": [{"sheet": 0}],
            "filters": [{"sheet": 0}],
            "outlines": [{"sheet": 0}],
            "printConfigs": [{"sheet": 0}],
            "customFormulas": [{"name": "DOUBLE"}],
        }
    });
    let (_, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    let kinds: Vec<_> = report.items.iter().map(|i| (i.kind.as_str(), i.count)).collect();
    assert_eq!(kinds, [
        ("threadedCommentsAsNotes", 1),
        ("conditionalFormats", 1),
        ("dataValidations", 1),
        ("definedNames", 1),
        ("tables", 1),
        ("rowColumnStyles", 1),
        ("cellRotation", 1),
        ("sheetProtection", 1),
        ("autoFilter", 1),
        ("outline", 1),
        ("printSetup", 1),
        ("customFormulas", 1),
        ("sheetVisibilityOrColor", 1),
    ]);
    assert!(report.summary.starts_with("Download requested. Not exported to Excel: threaded comments exported as notes, "));
}

#[test]
fn sheet_scoped_defined_names_and_named_formulas_round_trip_through_xlsx() {
    let native = serde_json::json!({
        "format": "einfach-workbook",
        "version": 1,
        "title": "ScopedNamesAndFormulas",
        "canvases": [
            {"rowCount": 1048576, "colCount": 16384},
            {"rowCount": 1048576, "colCount": 16384}
        ],
        "workbook": {
            "version": 1,
            "sheets": [
                {"idx": 0, "name": "Sheet1"},
                {"idx": 1, "name": "Sales Q1"}
            ],
            "cells": [],
            "namedRanges": [
                {"name": "TaxRate", "target": null, "formula": "=0.08"},
                {"name": "TaxRate", "scope": 0, "target": {"sheet": 0, "range": [0, 0, 0, 0]}},
                {"name": "TaxRate", "scope": 1, "target": null, "formula": "=SUM('Sales Q1'!$A$1:$A$10)*1.1"}
            ]
        }
    });
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(report.items.is_empty(), "unexpected export report: {:?}", report.items);
    let back = to_native(bytes);
    assert_eq!(back["workbook"]["namedRanges"], native["workbook"]["namedRanges"]);
}

#[test]
fn hidden_gridlines_and_headings_round_trip_through_sheet_view() {
    let native = serde_json::json!({
        "format": "einfach-workbook", "version": 1, "title": "View",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}, {"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1,
            "sheets": [{"idx": 0, "name": "Plain", "hideGridlines": true},
                {"idx": 1, "name": "Frozen", "hideHeadings": true}],
            "cells": [], "formats": [],
            "freeze": [{"sheet": 1, "rows": 1, "cols": 0}],
        }
    });
    let bytes = einfach_xlsx::native_to_xlsx(&native.to_string()).unwrap();
    let back = to_native(bytes);
    let sheets = &back["workbook"]["sheets"];
    assert_eq!(sheets[0]["hideGridlines"], true);
    assert!(sheets[0].get("hideHeadings").is_none(), "shown options add no field");
    assert_eq!(sheets[1]["hideHeadings"], true);
    assert!(sheets[1].get("hideGridlines").is_none());
    assert_eq!(back["workbook"]["freeze"][0]["rows"], 1, "a frozen pane still sits inside the view");
}
