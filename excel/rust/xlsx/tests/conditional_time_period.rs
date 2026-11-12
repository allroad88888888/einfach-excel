use std::io::{Cursor, Read, Write};
use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

const PERIODS: [&str; 10] = ["today", "yesterday", "tomorrow", "last7Days", "thisWeek",
    "lastWeek", "nextWeek", "thisMonth", "lastMonth", "nextMonth"];

// Handwritten SpreadsheetML: the fixture does not use this crate's exporter.
fn external(rules: &str, date1904: bool) -> Vec<u8> {
    let workbook = format!(r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="{}"/><sheets><sheet name="Dates" sheetId="1" r:id="rId1"/></sheets></workbook>"#, if date1904 { 1 } else { 0 });
    let sheet = format!(r#"<worksheet><sheetData><row r="1"><c r="B1" s="1"><v>43889.75</v></c><c r="D1"><f>TODAY()</f><v>45351</v></c></row></sheetData>{rules}</worksheet>"#);
    let parts = [
        ("xl/workbook.xml", workbook.as_str()),
        ("xl/_rels/workbook.xml.rels", r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../styles" Target="styles.xml"/></Relationships>"#),
        ("xl/styles.xml", r#"<styleSheet><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs><dxfs><dxf><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs></styleSheet>"#),
        ("xl/worksheets/sheet1.xml", sheet.as_str()),
    ];
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, body) in parts {
        writer.start_file(path, SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

fn read(bytes: Vec<u8>) -> (Value, einfach_xlsx::ConversionReport) {
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Dates").unwrap();
    (serde_json::from_str(&text).unwrap(), report)
}

#[test]
fn all_periods_import_by_type_and_roundtrip_with_formula_scope_and_stop() {
    let rules: String = PERIODS.iter().enumerate().map(|(index, period)| format!(
        r#"<conditionalFormatting sqref="B1:B3 D1:D3"><cfRule type="timePeriod" timePeriod="{period}" dxfId="0" priority="{}" stopIfTrue="1"><formula>TRUE</formula></cfRule></conditionalFormatting>"#, index + 1)).collect();
    let (native, report) = read(external(&rules, false));
    assert!(report.items.is_empty(), "{:?}", report.items);
    let entries = native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap();
    assert_eq!(entries.len(), 10);
    for (entry, period) in entries.iter().zip(PERIODS) {
        assert_eq!(entry["rule"], json!({"kind":"time-period", "period":period,
            "stopIfTrue":true, "format":{"bgColor":"#ffc7ce"}}));
        assert_eq!(entry["scope"]["additionalRanges"][0]["colStart"], 3);
    }
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(report.items.is_empty());
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
    let mut sheet = String::new();
    zip.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet).unwrap();
    for period in PERIODS {
        assert!(sheet.contains(&format!(r#"timePeriod="{period}""#)));
    }
    assert_eq!(sheet.matches("AND(ISNUMBER(B1),INT(B1)&gt;=").count(), 10);
    assert!(sheet.contains("WEEKDAY(TODAY(),1)"));
    assert!(sheet.contains("DATE(YEAR(TODAY()),MONTH(TODAY())+2,1)"));
    assert_eq!(sheet.matches(r#"sqref="B1:B3 D1:D3""#).count(), 10);
    assert_eq!(sheet.matches(r#"stopIfTrue="1""#).count(), 10);
    let (restored, report) = read(bytes);
    assert!(report.items.is_empty());
    assert_eq!(restored["workbook"]["conditionalFormats"], native["workbook"]["conditionalFormats"]);
    assert_eq!(restored["workbook"]["cells"], native["workbook"]["cells"]);
}

#[test]
fn missing_formulas_are_valid_but_unknown_periods_are_reported() {
    let rules = r#"<conditionalFormatting sqref="B1:B3">
        <cfRule type="timePeriod" timePeriod="today" dxfId="0" priority="1"/>
        <cfRule type="timePeriod" timePeriod="nextYear" dxfId="0" priority="2"/>
        <cfRule type="timePeriod" dxfId="0" priority="3"/>
        <cfRule type="aboveAverage" dxfId="0" priority="4"/>
        </conditionalFormatting>"#;
    let (native, report) = read(external(rules, false));
    assert_eq!(native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap().len(), 1);
    assert!(report.items.iter().any(|item| item.kind == "conditionalFormats" && item.count == 3));
}

#[test]
fn formatted_1904_dates_normalize_before_native_rule_evaluation() {
    let rules = r#"<conditionalFormatting sqref="B1"><cfRule type="timePeriod" timePeriod="today" dxfId="0" priority="1"/></conditionalFormatting>"#;
    let (native, report) = read(external(rules, true));
    assert_eq!(report.items.len(), 1);
    assert_eq!(report.items[0].kind, "date1904");
    assert_eq!(native["workbook"]["cells"][0]["value"], 45351.75);
    assert_eq!(native["workbook"]["cells"][1]["value"], "=TODAY()");
    assert_eq!(native["workbook"]["conditionalFormats"][0]["rules"][0]["rule"]["kind"], "time-period");
}
