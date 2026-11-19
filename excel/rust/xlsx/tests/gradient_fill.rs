use einfach_xlsx::{native_to_xlsx_with_report, xlsx_to_native_with_report};
use serde_json::{json, Value};
use std::io::{Cursor, Read};

fn format<'a>(file: &'a Value, addr: &str) -> &'a Value {
    file["workbook"]["formats"].as_array().unwrap().iter()
        .flat_map(|range| range["cellStyles"].as_array().into_iter().flatten())
        .find(|style| style["addr"] == addr).unwrap().get("format").unwrap()
}
fn xml(bytes: &[u8], part: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut result = String::new();
    archive.by_name(part).unwrap().read_to_string(&mut result).unwrap();
    result
}

#[test]
fn external_gradient_xml_preserves_path_coordinates_and_full_stop_lists_in_sparse_roundtrips() {
    let (text, report) = xlsx_to_native_with_report(include_bytes!(
        "../../../react-excel/e2e/xlsx/gradient-external.xlsx").to_vec(), "Gradients").unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "unsupportedFills").unwrap().count, 1);
    assert_eq!(report.items.iter().find(|item| item.kind == "incompleteGradients").unwrap().count, 1);
    let file: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(format(&file, "A1")["fill"]["degree"], -45.0);
    assert_eq!(format(&file, "A2")["fill"], json!({"kind":"path-gradient", "left":0.1,
        "right":0.7,"top":0.2,"bottom":0.6,"stops":[{"position":0.0,"color":"#808080"},
        {"position":0.4,"color":"#0000ff"},{"position":1.0,"color":"#ff0000"}]}));
    assert_eq!(format(&file, "A2")["bgColor"], "#808080");
    for edge in ["left", "right", "top", "bottom"] { assert_eq!(format(&file, "A3")["fill"][edge], 0.0); }
    assert_eq!(format(&file, "A3")["fill"]["stops"].as_array().unwrap().len(), 1);
    assert_eq!(format(&file, "A4")["fill"]["left"], 0.9);
    assert_eq!(format(&file, "A4")["fill"]["right"], 0.1);
    assert_eq!(format(&file, "A4")["fill"]["stops"][0]["position"], 1.0);
    assert_eq!(format(&file, "A4")["fill"]["stops"][3]["color"], "#ff00ff");
    let (bytes, report) = native_to_xlsx_with_report(&text).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "gradientBackground" || item.kind == "fillInheritance"));
    let styles = xml(&bytes, "xl/styles.xml");
    assert!(styles.contains(r#"type="path" left="0.1" right="0.7" top="0.2" bottom="0.6""#));
    assert_eq!(xml(&bytes, "xl/worksheets/sheet1.xml").matches("<c ").count(), 7);
    let (again, report) = xlsx_to_native_with_report(bytes, "Again").unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "unsupportedFills"));
    let again: Value = serde_json::from_str(&again).unwrap();
    for index in 1..=7 { assert_eq!(format(&file, &format!("A{index}")), format(&again, &format!("A{index}"))); }
    for layer in ["rowStyles", "columnStyles"] {
        assert_eq!(again["workbook"]["formats"][0][layer], file["workbook"]["formats"][0][layer]);
    }
}

fn native(fill: Value, background: &str) -> Value {
    json!({"format":"einfach-workbook","version":1,"title":"Gradient",
        "canvases":[{"rowCount":30,"colCount":8}],"workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}],"cells":[],"formats":[{
            "sheet":0,"startRow":0,"endRow":0,"startCol":0,"endCol":0,
            "cellStyles":[{"addr":"A1","format":{"fill":fill,"bgColor":background}}]
        }]}})
}

#[test]
fn gradient_fallback_uses_zero_position_color_and_reports_unencodable_native_background() {
    let fill = json!({"kind":"linear-gradient","degree":-450.0,"stops":[
        {"position":1.0,"color":"#0000ff"},{"position":0.0,"color":"#ff0000"},
        {"position":0.0,"color":"#00ff00"}]});
    for background in ["#00ff00", "#abcdef"] {
        let source = native(fill.clone(), background);
        let (bytes, report) = native_to_xlsx_with_report(&source.to_string()).unwrap();
        assert_eq!(report.items.iter().any(|item| item.kind == "gradientBackground"), background == "#abcdef");
        let (text, _) = xlsx_to_native_with_report(bytes, "Again").unwrap();
        let file: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(format(&file, "A1")["fill"], fill);
        assert_eq!(format(&file, "A1")["bgColor"], "#00ff00");
    }
}

#[test]
fn invalid_native_gradient_payloads_reject_before_xlsx_serialization() {
    for fill in [json!({"kind":"path-gradient","left":0,"right":2,"top":0,"bottom":1,"stops":[]}),
        json!({"kind":"linear-gradient","degree":90,"stops":[{"position":0,"color":"red"}]}),
        json!({"kind":"linear-gradient","degree":90,"stops":vec![json!({"position":0.5,"color":"#123456"});257]})] {
        assert!(native_to_xlsx_with_report(&native(fill, "#ffffff").to_string()).is_err());
    }
}

#[test]
fn gradient_without_explicit_background_reports_no_background_loss_and_invalid_gradient_counts_once() {
    let fill = json!({"kind":"linear-gradient","degree":90.0,"stops":[
        {"position":0.0,"color":"#123456"},{"position":1.0,"color":"#abcdef"}]});
    let no_bg = json!({"format":"einfach-workbook","version":1,"title":"Gradient",
        "canvases":[{"rowCount":10,"colCount":4}],"workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}],"cells":[],"formats":[{
            "sheet":0,"startRow":0,"endRow":0,"startCol":0,"endCol":0,
            "cellStyles":[{"addr":"A1","format":{"fill":fill}}]
        }]}});
    let (_, report) = native_to_xlsx_with_report(&no_bg.to_string()).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "gradientBackground"));
}
