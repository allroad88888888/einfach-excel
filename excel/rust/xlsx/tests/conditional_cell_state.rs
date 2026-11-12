use std::io::{Cursor, Read, Write};
use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

const TYPES: [(&str, &str, &str); 4] = [
    ("containsBlanks", "blank", "LEN(TRIM(B1))=0"),
    ("notContainsBlanks", "not-blank", "LEN(TRIM(B1))&gt;0"),
    ("containsErrors", "error", "ISERROR(B1)"),
    ("notContainsErrors", "not-error", "NOT(ISERROR(B1))"),
];

fn external() -> Vec<u8> {
    let rules: String = TYPES.iter().enumerate().map(|(i, (kind, _, _))| format!(
        r#"<cfRule type="{kind}" dxfId="0" priority="{}" stopIfTrue="1">{}</cfRule>"#,
        i + 1, if i == 0 { "<formula>FALSE</formula>" } else { "" })).collect();
    let sheet = format!(r#"<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t xml:space="preserve">   </t></is></c><c r="D1"><f>1/0</f><v>0</v></c></row></sheetData><conditionalFormatting sqref="B1:B3 D1:D3">{rules}</conditionalFormatting></worksheet>"#);
    let parts = [
        ("xl/workbook.xml", r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="States" sheetId="1" r:id="rId1"/></sheets></workbook>"#),
        ("xl/_rels/workbook.xml.rels", r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../styles" Target="styles.xml"/></Relationships>"#),
        ("xl/styles.xml", r#"<styleSheet><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf numFmtId="0"/></cellXfs><dxfs><dxf><font><b/></font></dxf></dxfs></styleSheet>"#),
        ("xl/worksheets/sheet1.xml", sheet.as_str()),
    ];
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, text) in parts {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
fn read(bytes: Vec<u8>) -> Value {
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "States").unwrap();
    assert!(report.items.is_empty(), "{:?}", report.items);
    serde_json::from_str(&text).unwrap()
}

#[test]
fn four_presets_import_without_formulas_and_keep_known_type_over_conflicting_formula() {
    let native = read(external());
    let entries = native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap();
    assert_eq!(entries.len(), 4);
    for (entry, (_, condition, _)) in entries.iter().zip(TYPES) {
        assert_eq!(entry["rule"], json!({"kind":"cell-state", "condition":condition,
            "stopIfTrue":true, "format":{"bold":true}}));
        assert_eq!(entry["scope"]["additionalRanges"][0]["colStart"], 3);
    }
}

#[test]
fn relative_compatibility_formulas_and_preset_options_roundtrip_without_changing_values() {
    let native = read(external());
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(report.items.is_empty());
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
    let mut xml = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut xml).unwrap();
    for (kind, _, formula) in TYPES {
        assert!(xml.contains(&format!(r#"type="{kind}""#)));
        assert!(xml.contains(&format!("<formula>{formula}</formula>")));
    }
    assert_eq!(xml.matches(r#"sqref="B1:B3 D1:D3""#).count(), 4);
    assert_eq!(xml.matches(r#"stopIfTrue="1""#).count(), 4);
    let restored = read(bytes);
    assert_eq!(restored["workbook"]["conditionalFormats"], native["workbook"]["conditionalFormats"]);
    assert_eq!(restored["workbook"]["cells"], native["workbook"]["cells"]);
}
