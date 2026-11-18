use einfach_xlsx::{native_to_xlsx_with_report, xlsx_to_native_with_report};
use serde_json::{json, Value};
use std::io::{Cursor, Read};

fn xml(bytes: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut text = String::new();
    archive.by_name(name).unwrap().read_to_string(&mut text).unwrap();
    text
}

fn cell_format<'a>(file: &'a Value, addr: &str) -> Option<&'a Value> {
    file["workbook"]["formats"].as_array()?.iter()
        .flat_map(|range| range["cellStyles"].as_array().into_iter().flatten())
        .find(|style| style["addr"] == addr).map(|style| &style["format"])
}

#[test]
fn independent_xlsx_keeps_sparse_flags_and_emits_explicit_false_without_resizing_fonts() {
    let (text, report) = xlsx_to_native_with_report(include_bytes!(
        "../../../react-excel/e2e/xlsx/shrink-external.xlsx").to_vec(), "Shrink").unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "rowColumnStyles"));
    let file: Value = serde_json::from_str(&text).unwrap();
    assert!(cell_format(&file, "A1").and_then(|f| f.get("shrinkToFit")).is_none());
    assert_eq!(cell_format(&file, "A2").unwrap()["shrinkToFit"], false);
    assert_eq!(cell_format(&file, "A2").unwrap()["wrap"], false);
    assert_eq!(cell_format(&file, "A2").unwrap()["fontSize"], 24);
    assert_eq!(cell_format(&file, "B1").unwrap()["shrinkToFit"], true);
    assert_eq!(cell_format(&file, "B1").unwrap()["wrap"], true);
    let format = &file["workbook"]["formats"][0];
    assert_eq!(format["columnStyles"][0]["format"]["shrinkToFit"], true);
    assert_eq!(format["rowStyles"][0]["format"]["shrinkToFit"], true);
    assert_eq!(format["rowStyles"][0]["format"]["wrap"], true);
    let (bytes, report) = native_to_xlsx_with_report(&text).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "rowColumnStyles"));
    let styles = xml(&bytes, "xl/styles.xml");
    assert!(styles.contains(r#"shrinkToFit="1""#));
    assert!(styles.contains(r#"shrinkToFit="0""#));
    assert!(styles.contains(r#"wrapText="0""#));
    assert!(styles.contains(r#"<sz val="24"/>"#));
    let (restored, _) = xlsx_to_native_with_report(bytes, "Restored").unwrap();
    let restored: Value = serde_json::from_str(&restored).unwrap();
    for addr in ["A1", "A2", "B1", "C1", "E1"] {
        for key in ["shrinkToFit", "wrap", "fontSize"] {
            assert_eq!(cell_format(&restored, addr).and_then(|f| f.get(key)),
                cell_format(&file, addr).and_then(|f| f.get(key)), "{addr}: {key}");
        }
    }
    assert_eq!(restored["workbook"]["cells"], file["workbook"]["cells"]);
    assert_eq!(restored["workbook"]["richText"], file["workbook"]["richText"]);
}

#[test]
fn sparse_axis_false_roundtrips_without_cells_or_loss_reports() {
    let file = json!({"format":"einfach-workbook", "version":1, "title":"Sparse", "canvases":[{
        "rowCount":1048576,"colCount":16384}], "workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}], "cells":[], "formats":[{
            "sheet":0,"startRow":0,"startCol":0,"endRow":1048575,"endCol":16383,
            "rowStyles":[{"index":999999,"format":{"shrinkToFit":false,"wrap":false}}],
            "columnStyles":[{"index":100,"format":{"shrinkToFit":true,"wrap":true}}]
        }]}});
    let (bytes, report) = native_to_xlsx_with_report(&file.to_string()).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "rowColumnStyles"));
    assert!(bytes.len() < 10000);
    assert!(!xml(&bytes, "xl/worksheets/sheet1.xml").contains("<c "));
    let (restored, report) = xlsx_to_native_with_report(bytes, "Sparse").unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "rowColumnStyles"));
    let restored: Value = serde_json::from_str(&restored).unwrap();
    assert!(restored["workbook"]["cells"].as_array().unwrap().is_empty());
    for key in ["rowStyles", "columnStyles"] {
        assert_eq!(restored["workbook"]["formats"][0][key], file["workbook"]["formats"][0][key]);
    }
}
