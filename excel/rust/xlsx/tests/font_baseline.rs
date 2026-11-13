use einfach_xlsx::{native_to_xlsx, native_to_xlsx_with_report, xlsx_to_native, xlsx_to_native_with_report};
use serde_json::{json, Value};
use std::io::{Cursor, Read};

fn xml(bytes: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut text = String::new();
    archive.by_name(name).unwrap().read_to_string(&mut text).unwrap();
    text
}

fn baseline(file: &Value, addr: &str) -> Option<String> {
    file["workbook"]["formats"].as_array()?.iter()
        .flat_map(|range| range["cellStyles"].as_array().into_iter().flatten())
        .find(|style| style["addr"] == addr)?["format"]["fontBaseline"].as_str().map(str::to_string)
}

#[test]
fn independent_ooxml_preserves_missing_cell_style_explicit_normal_and_both_rich_encodings() {
    let source = include_bytes!("../../../react-excel/e2e/xlsx/font-baseline-external.xlsx");
    let input = xlsx_to_native(source.to_vec(), "External").unwrap();
    let file: Value = serde_json::from_str(&input).unwrap();
    assert_eq!(baseline(&file, "A1"), None);
    assert_eq!(baseline(&file, "B2"), None);
    assert_eq!(baseline(&file, "D1"), None);
    assert_eq!(baseline(&file, "A2").as_deref(), Some("normal"));
    assert_eq!(baseline(&file, "C1").as_deref(), Some("normal"));
    let formats = &file["workbook"]["formats"][0];
    assert_eq!(formats["columnStyles"][0]["format"]["fontBaseline"], "superscript");
    assert_eq!(formats["rowStyles"][0]["format"]["fontBaseline"], "subscript");
    assert_eq!(file["workbook"]["cells"].as_array().unwrap().len(), 8);
    for cell in file["workbook"]["richText"].as_array().unwrap() {
        assert!(cell["runs"][0]["format"].get("fontBaseline").is_none());
        assert_eq!(cell["runs"][1]["format"]["fontBaseline"], "normal");
    }
    let bytes = native_to_xlsx(&input).unwrap();
    let styles = xml(&bytes, "xl/styles.xml");
    for value in ["baseline", "superscript", "subscript"] {
        assert!(styles.contains(&format!(r#"<vertAlign val="{value}"/>"#)));
    }
    assert!(styles.contains(r#"<sz val="20"/>"#));
    let sheet = xml(&bytes, "xl/worksheets/sheet1.xml");
    assert!(sheet.contains("customFormat=\"1\""));
    assert!(sheet.contains("<col min=\"1\" max=\"1\" style="));
    let restored: Value = serde_json::from_str(&xlsx_to_native(bytes, "Restored").unwrap()).unwrap();
    assert_eq!(baseline(&restored, "A1"), None);
    assert_eq!(baseline(&restored, "A2").as_deref(), Some("normal"));
    assert_eq!(restored["workbook"]["richText"], file["workbook"]["richText"]);
}

#[test]
fn empty_large_sheet_keeps_one_sparse_row_and_column_without_materializing_cells() {
    let file = json!({"format":"einfach-workbook", "version":1, "title":"Sparse", "canvases":[{
        "rowCount":1048576,"colCount":16384}], "workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}], "cells":[], "formats":[{
            "sheet":0,"startRow":0,"startCol":0,"endRow":1048575,"endCol":16383,
            "rowStyles":[{"index":999999,"format":{"fontBaseline":"normal"}}],
            "columnStyles":[{"index":100,"format":{"fontBaseline":"superscript"}}]
        }]}});
    let (bytes, report) = native_to_xlsx_with_report(&file.to_string()).unwrap();
    assert!(!serde_json::to_string(&report).unwrap().contains("rowColumnStyles"));
    assert!(bytes.len() < 10000);
    assert!(!xml(&bytes, "xl/worksheets/sheet1.xml").contains("<c "));
    let restored: Value = serde_json::from_str(&xlsx_to_native(bytes, "Sparse").unwrap()).unwrap();
    assert!(restored["workbook"]["cells"].as_array().unwrap().is_empty());
    let range = &restored["workbook"]["formats"][0];
    assert!(range["cellStyles"].as_array().unwrap().is_empty());
    assert_eq!(range["rowStyles"].as_array().unwrap().len(), 1);
    assert_eq!(range["columnStyles"].as_array().unwrap().len(), 1);
    assert_eq!(range["rowStyles"][0]["format"]["fontBaseline"], "normal");
    let mut mixed = file;
    mixed["workbook"]["formats"][0]["columnStyles"][0]["format"]["bold"] = json!(true);
    let (_, report) = native_to_xlsx_with_report(&mixed.to_string()).unwrap();
    assert!(serde_json::to_string(&report).unwrap().contains("rowColumnStyles"));
}

#[test]
fn native_rejects_unknown_baseline_instead_of_silently_dropping_it() {
    let input = xlsx_to_native(include_bytes!(
        "../../../react-excel/e2e/xlsx/font-baseline-external.xlsx").to_vec(), "External").unwrap();
    assert!(native_to_xlsx(&input.replace("superscript", "invalid-baseline")).is_err());
}

#[test]
fn independent_mixed_axis_import_reports_unsupported_bold_while_preserving_baseline() {
    let bytes = include_bytes!("../../../react-excel/e2e/xlsx/font-baseline-mixed-axis.xlsx");
    let (text, report) = xlsx_to_native_with_report(bytes.to_vec(), "Mixed axis").unwrap();
    let item = report.items.iter().find(|item| item.kind == "rowColumnStyles").unwrap();
    assert_eq!(item.count, 1);
    assert!(report.summary.contains("row or column styles"));
    let file: Value = serde_json::from_str(&text).unwrap();
    let column = &file["workbook"]["formats"][0]["columnStyles"][0];
    assert_eq!(column["format"]["fontBaseline"], "superscript");
    assert!(column["format"].get("bold").is_none());
    assert_eq!(file["workbook"]["cells"].as_array().unwrap().len(), 6);
}
