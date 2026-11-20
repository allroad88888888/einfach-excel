use std::io::{Cursor, Read, Write};
use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

// Hand-authored SpreadsheetML independent of the exporter, without required formulas.
fn external(attrs: &[&str]) -> Vec<u8> {
    let rules: String = attrs.iter().enumerate().map(|(i, attrs)| format!(
        r#"<cfRule type="aboveAverage" dxfId="0" priority="{}" {attrs}/>"#, i + 1)).collect();
    let sheet = format!(r#"<worksheet><sheetData><row r="1"><c r="A1"><v>0</v></c><c r="C1"><v>10</v></c></row></sheetData><conditionalFormatting sqref="A1:A3 C1:C3">{rules}</conditionalFormatting></worksheet>"#);
    let parts = [
        ("xl/workbook.xml", r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mean" sheetId="1" r:id="rId1"/></sheets></workbook>"#),
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
fn read(bytes: Vec<u8>) -> (Value, einfach_xlsx::ConversionReport) {
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Mean").unwrap();
    (serde_json::from_str(&text).unwrap(), report)
}

#[test]
fn directions_equal_defaults_and_stop_roundtrip_as_native_mean_types() {
    let attrs = ["", r#"aboveAverage="false""#, r#"equalAverage="true""#,
        r#"aboveAverage="0" equalAverage="1" stdDev="0" stopIfTrue="1""#];
    let (native, report) = read(external(&attrs));
    assert!(report.items.is_empty());
    let entries = native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap();
    assert_eq!(entries.len(), 4);
    for (index, entry) in entries.iter().enumerate() {
        assert_eq!(entry["rule"]["kind"], "above-average");
        assert_eq!(entry["rule"]["direction"], if index % 2 == 0 {"above"} else {"below"});
        assert_eq!(entry["rule"]["equalAverage"], index >= 2);
        assert_eq!(entry["rule"]["format"], json!({"bold":true}));
        assert_eq!(entry["scope"]["additionalRanges"][0]["colStart"], 2);
    }
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(report.items.is_empty());
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
    let mut xml = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut xml).unwrap();
    assert_eq!(xml.matches(r#"type="aboveAverage""#).count(), 4);
    assert!(xml.contains(r#"aboveAverage="0" equalAverage="1" stopIfTrue="1""#));
    assert!(!xml.contains("stdDev"));
    let (restored, report) = read(bytes);
    assert!(report.items.is_empty());
    assert_eq!(restored["workbook"]["conditionalFormats"], native["workbook"]["conditionalFormats"]);
}

#[test]
fn malformed_attributes_and_deviation_rules_are_reported_without_downgrading() {
    let attrs = [r#"stdDev="1""#, r#"stdDev="-1""#, r#"stdDev="0.0""#,
        r#"stdDev="nan""#, r#"aboveAverage="yes""#, r#"equalAverage="2""#,
        r#"aboveAverage="""#, r#"equalAverage="FALSE""#, ""];
    let (native, report) = read(external(&attrs));
    assert_eq!(native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap().len(), 1);
    assert!(report.items.iter().any(|item| item.kind == "conditionalFormats" && item.count == 8));
}
