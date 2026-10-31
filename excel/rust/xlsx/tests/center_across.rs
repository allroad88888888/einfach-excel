use serde_json::{json, Value};

fn native(align: &str) -> String {
    json!({
        "format": "einfach-workbook", "version": 1, "title": "T",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1, "sheets": [{"idx": 0, "name": "S"}],
            "cells": [{"sheet": 0, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Title"}],
            "formats": [{"sheet": 0, "startRow": 0, "startCol": 0, "endRow": 4294967295u32,
                "endCol": 4294967295u32,
                "cellStyles": [{"addr": "A1", "format": {"align": align}}],
                "rowStyles": [], "columnStyles": []}],
        }
    })
    .to_string()
}

fn align_of(bytes: Vec<u8>) -> Value {
    let back: Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "T").unwrap()).unwrap();
    back["workbook"]["formats"][0]["cellStyles"][0]["format"]["align"].clone()
}

fn sheet_styles_xml(bytes: &[u8]) -> String {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut text = String::new();
    zip.by_name("xl/styles.xml").unwrap().read_to_string(&mut text).unwrap();
    text
}

#[test]
fn center_across_is_written_as_center_continuous_and_read_back() {
    let bytes = einfach_xlsx::native_to_xlsx(&native("centerAcross")).unwrap();
    assert!(sheet_styles_xml(&bytes).contains(r#"horizontal="centerContinuous""#));
    assert_eq!(align_of(bytes), "centerAcross");
}

#[test]
fn plain_center_stays_center() {
    let bytes = einfach_xlsx::native_to_xlsx(&native("center")).unwrap();
    let xml = sheet_styles_xml(&bytes);
    assert!(xml.contains(r#"horizontal="center""#) && !xml.contains("centerContinuous"));
    assert_eq!(align_of(bytes), "center");
}
