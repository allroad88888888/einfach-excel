use einfach_xlsx::{native_to_xlsx_with_report, xlsx_to_native_with_report};
use serde_json::{json, Value};
use std::io::{Cursor, Read};

const PATTERNS: [&str; 17] = ["mediumGray", "darkGray", "lightGray", "darkHorizontal", "darkVertical",
    "darkDown", "darkUp", "darkGrid", "darkTrellis", "lightHorizontal", "lightVertical", "lightDown",
    "lightUp", "lightGrid", "lightTrellis", "gray125", "gray0625"];

fn format<'a>(file: &'a Value, addr: &str) -> Option<&'a Value> {
    file["workbook"]["formats"].as_array()?.iter()
        .flat_map(|range| range["cellStyles"].as_array().into_iter().flatten())
        .find(|style| style["addr"] == addr)?.get("format")
}

fn xml(bytes: &[u8], path: &str) -> String {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut result = String::new();
    archive.by_name(path).unwrap().read_to_string(&mut result).unwrap();
    result
}

#[test]
fn independent_xml_preserves_seventeen_patterns_and_reports_unsupported_fills_without_solid_recoloring() {
    let (text, report) = xlsx_to_native_with_report(include_bytes!(
        "../../../react-excel/e2e/xlsx/pattern-external.xlsx").to_vec(), "Patterns").unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "unsupportedFills").unwrap().count, 2);
    let file: Value = serde_json::from_str(&text).unwrap();
    for (i, pattern) in PATTERNS.iter().enumerate() {
        let f = format(&file, &format!("A{}", i + 1)).unwrap();
        assert_eq!(f["fill"], json!({"kind":"pattern","pattern":pattern,"foreground":"#c00000"}));
        assert_eq!(f["bgColor"], "#fff2cc");
    }
    let f = format(&file, "A20").unwrap();
    assert_eq!(f["fill"]["foreground"], "#0000ff");
    assert_eq!(f["bgColor"], "#808080");
    let conditional = &file["workbook"]["conditionalFormats"][0]["rules"][0]["rule"]["format"];
    // The supported font component remains; unsupported pattern colors cannot become a solid fill.
    assert!(!text.contains("\"bgColor\":\"#00ff00\""));
    assert_eq!(conditional["bold"], true);
    assert!(conditional.get("bgColor").is_none());
    let (bytes, report) = native_to_xlsx_with_report(&text).unwrap();
    assert!(!report.items.iter().any(|item| matches!(item.kind.as_str(), "rowColumnStyles" | "fillInheritance")));
    let styles = xml(&bytes, "xl/styles.xml");
    assert!(styles.contains(r#"<patternFill patternType="lightDown"><fgColor rgb="FFC00000"/><bgColor rgb="FFFFF2CC"/>"#));
    assert!(styles.contains(r#"fillId="0" borderId="0" xfId="0" applyFill="1""#));
    let (restored, report) = xlsx_to_native_with_report(bytes, "Again").unwrap();
    assert!(report.items.is_empty(), "{report:?}");
    let restored: Value = serde_json::from_str(&restored).unwrap();
    for i in 1..=17 { assert_eq!(format(&restored, &format!("A{i}")), format(&file, &format!("A{i}"))); }
    assert_eq!(format(&restored, "A19").unwrap()["fill"], Value::Null);
    assert_eq!(format(&restored, "A19").unwrap().get("bgColor"), Some(&Value::Null));
    assert!(format(&restored, "B19").is_none());
    assert!(format(&restored, "C19").is_none());
    assert_eq!(restored["workbook"]["formats"][0]["rowStyles"], file["workbook"]["formats"][0]["rowStyles"]);
    assert_eq!(restored["workbook"]["formats"][0]["columnStyles"], file["workbook"]["formats"][0]["columnStyles"]);
}

fn native() -> Value {
    json!({"format":"einfach-workbook","version":1,"title":"Pattern layers",
        "canvases":[{"rowCount":100,"colCount":20}],"workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}],"cells":[],"formats":[{
            "sheet":0,"startRow":0,"endRow":99,"startCol":0,"endCol":19,
            "cellStyles":[{"addr":"A1","format":{"fill":null,"bgColor":null}}],
            "rowStyles":[{"index":0,"format":{"bgColor":"#ffcc00",
                "fill":{"kind":"pattern","pattern":"darkUp","foreground":"#0000ff"}}}],
            "columnStyles":[{"index":1,"format":{"bgColor":"#ffffff",
                "fill":{"kind":"pattern","pattern":"gray0625","foreground":"#ff0000"}}}]
        }]}})
}

#[test]
fn sparse_axis_patterns_and_explicit_clear_roundtrip_without_expanding_cells() {
    let source = native();
    let (bytes, report) = native_to_xlsx_with_report(&source.to_string()).unwrap();
    assert!(report.items.is_empty());
    assert_eq!(xml(&bytes, "xl/worksheets/sheet1.xml").matches("<c ").count(), 1);
    let (text, report) = xlsx_to_native_with_report(bytes, "Patterns").unwrap();
    assert!(report.items.is_empty());
    let file: Value = serde_json::from_str(&text).unwrap();
    for key in ["cellStyles", "rowStyles", "columnStyles"] {
        assert_eq!(file["workbook"]["formats"][0][key], source["workbook"]["formats"][0][key]);
    }
}

#[test]
fn partial_cell_clear_preserves_inherited_base_but_reports_live_inheritance_loss() {
    let mut source = native();
    source["workbook"]["formats"][0]["cellStyles"][0]["format"].as_object_mut().unwrap().remove("bgColor");
    let (bytes, report) = native_to_xlsx_with_report(&source.to_string()).unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "fillInheritance").unwrap().count, 1);
    let (text, _) = xlsx_to_native_with_report(bytes, "Patterns").unwrap();
    let file: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(format(&file, "A1").unwrap(), &json!({"bgColor":"#ffcc00","fill":null}));
}

#[test]
fn invalid_native_descriptors_are_rejected_instead_of_written_as_solid() {
    let mut source = native();
    for invalid in [json!({"kind":"pattern","pattern":"unknown","foreground":"#ff0000"}),
        json!({"kind":"pattern","pattern":"lightUp","foreground":"red"}),
        json!({"kind":"pattern","pattern":"lightUp","foreground":"#ff0000","background":"#ffffff"}),
        json!({"kind":"future"})] {
        source["workbook"]["formats"][0]["cellStyles"][0]["format"]["fill"] = invalid;
        assert!(native_to_xlsx_with_report(&source.to_string()).is_err());
    }
}
