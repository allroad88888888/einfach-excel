use serde_json::{json, Value};

/// 带颜色、条件、填充与文本段的自定义代码必须原样写进 styles.xml 并读回为 custom。
const CODE: &str = "[Blue][>=1000]#,##0,\"K\";[Red](#,##0.00);_($* \"-\"??_);\"Note: \"@";

fn native(code: &str) -> String {
    json!({
        "format": "einfach-workbook", "version": 1, "title": "T",
        "canvases": [{"rowCount": 1048576, "colCount": 16384}],
        "workbook": {
            "version": 1, "sheets": [{"idx": 0, "name": "S"}],
            "cells": [{"sheet": 0, "addr": "A1", "row": 0, "col": 0, "kind": "number", "value": -1234.5}],
            "formats": [{"sheet": 0, "startRow": 0, "startCol": 0, "endRow": 4294967295u32,
                "endCol": 4294967295u32,
                "cellStyles": [{"addr": "A1", "format": {
                    "numberFormat": {"kind": "custom", "pattern": code}}}],
                "rowStyles": [], "columnStyles": []}],
        }
    })
    .to_string()
}

fn styles_xml(bytes: &[u8]) -> String {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut text = String::new();
    zip.by_name("xl/styles.xml").unwrap().read_to_string(&mut text).unwrap();
    text
}

#[test]
fn colored_sectioned_custom_code_round_trips_verbatim() {
    let bytes = einfach_xlsx::native_to_xlsx(&native(CODE)).unwrap();
    let xml = styles_xml(&bytes);
    assert!(xml.contains("[Blue][&gt;=1000]#,##0,&quot;K&quot;;[Red](#,##0.00)"), "{xml}");
    let back: Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "T").unwrap()).unwrap();
    let format = &back["workbook"]["formats"][0]["cellStyles"][0]["format"]["numberFormat"];
    assert_eq!(format["kind"], "custom");
    assert_eq!(format["pattern"], CODE);
}
