use einfach_xlsx::{native_to_xlsx_with_report, xlsx_to_native_with_report};
use serde_json::{json, Value};
use std::io::{Cursor, Read, Write};

fn borders<'a>(file: &'a Value, addr: &str) -> Option<&'a Value> {
    file["workbook"]["formats"].as_array()?.iter()
        .flat_map(|range| range["cellStyles"].as_array().into_iter().flatten())
        .find(|style| style["addr"] == addr)?.get("format")?.get("borders")
}

#[test]
fn independent_xml_flags_share_one_spec_and_survive_emitted_xml_and_reimport() {
    let (text, report) = xlsx_to_native_with_report(include_bytes!(
        "../../../react-excel/e2e/xlsx/diagonal-external.xlsx").to_vec(), "Diagonals").unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "diagonalBorders").unwrap().count, 1);
    let file: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(borders(&file, "A1").unwrap()["diagDown"], json!({"style":"thin","color":"#c00000"}));
    assert_eq!(borders(&file, "A1").unwrap()["bottom"], json!({"style":"medium","color":"#123abc"}));
    assert_eq!(borders(&file, "B1").unwrap()["diagUp"], json!({"style":"dotted","color":"#0000ff"}));
    let both = borders(&file, "C1").unwrap();
    assert_eq!(both["diagDown"], both["diagUp"]);
    assert_eq!(both["diagUp"], json!({"style":"double","color":"#008000"}));
    for addr in ["D1", "E1", "F1"] { assert!(borders(&file, addr).is_none(), "{addr}"); }
    let (bytes, report) = native_to_xlsx_with_report(&text).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "diagonalBorders"));
    let mut archive = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
    let mut xml = String::new();
    archive.by_name("xl/styles.xml").unwrap().read_to_string(&mut xml).unwrap();
    assert!(xml.contains(r#"diagonalUp="1" diagonalDown="1""#));
    assert!(xml.contains(r#"<diagonal style="double"><color rgb="FF008000"/></diagonal>"#));
    assert!(xml.contains(r#"diagonalUp="0" diagonalDown="1""#));
    let (restored, _) = xlsx_to_native_with_report(bytes, "Restored").unwrap();
    let restored: Value = serde_json::from_str(&restored).unwrap();
    for addr in ["A1", "B1", "C1", "A3"] { assert_eq!(borders(&restored, addr), borders(&file, addr)); }
    assert_eq!(restored["workbook"]["cells"], file["workbook"]["cells"]);
    assert_eq!(restored["workbook"]["merges"], file["workbook"]["merges"]);
}

#[test]
fn native_export_rejects_invalid_diagonals_instead_of_silently_dropping_one_direction() {
    let mut file = json!({"format":"einfach-workbook","version":1,"title":"Invalid",
        "canvases":[{"rowCount":20,"colCount":8}],"workbook":{"version":1,
        "sheets":[{"idx":0,"name":"Sheet1"}],"cells":[],"formats":[{
            "sheet":0,"startRow":0,"endRow":0,"startCol":0,"endCol":0,
            "cellStyles":[{"addr":"A1","format":{"borders":{}}}]
        }]}});
    for invalid in [json!({"diagUp":{"style":"invalid"}}),
        json!({"diagDown":{"style":"thin","color":"red"}}),
        json!({"diagUp":{"style":"thin"},"diagDown":{"style":"double"}}),
        json!({"diagUp":{"style":"thin","color":"#ff0000"},"diagDown":{"style":"thin","color":"#00ff00"}})] {
        file["workbook"]["formats"][0]["cellStyles"][0]["format"]["borders"] = invalid;
        assert!(native_to_xlsx_with_report(&file.to_string()).is_err());
    }
}

#[test]
fn diagonal_color_does_not_recolor_a_preceding_self_closing_physical_edge() {
    let mut input = zip::ZipArchive::new(Cursor::new(include_bytes!(
        "../../../react-excel/e2e/xlsx/diagonal-external.xlsx"))).unwrap();
    let mut output = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..input.len() {
        let mut entry = input.by_index(i).unwrap();
        let name = entry.name().to_owned();
        let mut bytes = Vec::new(); entry.read_to_end(&mut bytes).unwrap();
        if name == "xl/styles.xml" {
            bytes = String::from_utf8(bytes).unwrap()
                .replace(r#"<bottom style="medium"><color rgb="FF123ABC"/></bottom>"#,
                    r#"<bottom style="medium"/>"#).into_bytes();
        }
        output.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
        output.write_all(&bytes).unwrap();
    }
    let (text, _) = xlsx_to_native_with_report(output.finish().unwrap().into_inner(), "Isolation").unwrap();
    let file: Value = serde_json::from_str(&text).unwrap();
    let borders = borders(&file, "A1").unwrap();
    assert_eq!(borders["bottom"], json!({"style":"medium"}));
    assert_eq!(borders["diagDown"], json!({"style":"thin","color":"#c00000"}));
}
