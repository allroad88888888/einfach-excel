use std::io::{Cursor, Read, Write};

use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

fn make_xlsx(rules_xml: &str) -> Vec<u8> {
    let sheet = format!(
        r#"<worksheet><sheetData><row r="1"><c r="A1"><v>10</v></c></row></sheetData><conditionalFormatting sqref="A1:A10 C1:C10">{rules_xml}</conditionalFormatting></worksheet>"#
    );
    let parts = [
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Icons" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../styles" Target="styles.xml"/></Relationships>"#,
        ),
        (
            "xl/styles.xml",
            r#"<styleSheet><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf numFmtId="0"/></cellXfs></styleSheet>"#,
        ),
        ("xl/worksheets/sheet1.xml", sheet.as_str()),
    ];
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, body) in parts {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(body.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

#[test]
fn supported_icon_sets_thresholds_and_flags_roundtrip_without_losses() {
    let rules_xml = concat!(
        r#"<cfRule type="iconSet" priority="1"><iconSet iconSet="3Arrows" showValue="0" reverse="1">"#,
        r#"<cfvo type="percent" val="0"/><cfvo type="num" val="10" gte="1"/><cfvo type="formula" val="_xlfn.MAXIFS($B$1:$B$5,$B$1:$B$5,&quot;&gt;0&quot;)" gte="true"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="2"><iconSet>"#,
        r#"<cfvo type="min"/><cfvo type="percentile" val="25"/><cfvo type="max"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="3"><iconSet iconSet="3Flags">"#,
        r#"<cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="4"><iconSet iconSet="3ArrowsGray">"#,
        r#"<cfvo type="percent" val="0"/><cfvo type="percent" val="20"/><cfvo type="percent" val="80"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="5"><iconSet iconSet="3TrafficLights2">"#,
        r#"<cfvo type="percent" val="0"/><cfvo type="percent" val="40"/><cfvo type="percent" val="70"/></iconSet></cfRule>"#,
    );
    let (text, import_report) =
        einfach_xlsx::xlsx_to_native_with_report(make_xlsx(rules_xml), "Icons").unwrap();
    assert!(import_report.items.is_empty(), "{:?}", import_report.items);

    let native: Value = serde_json::from_str(&text).unwrap();
    let entries = native["workbook"]["conditionalFormats"][0]["rules"].as_array().unwrap();
    assert_eq!(entries.len(), 5);

    assert_eq!(
        entries[0]["rule"],
        json!({
            "kind": "icon-set",
            "iconSet": "three-arrows",
            "reverse": true,
            "showValue": false,
            "lowerThreshold": {"type": "number", "value": "10"},
            "upperThreshold": {"type": "formula", "value": "=MAXIFS($B$1:$B$5,$B$1:$B$5,\">0\")"}
        })
    );
    assert_eq!(
        entries[1]["rule"],
        json!({
            "kind": "icon-set",
            "iconSet": "three-traffic-lights",
            "lowerThreshold": {"type": "percentile", "value": "25"},
            "upperThreshold": {"type": "max"}
        })
    );
    assert_eq!(entries[2]["rule"]["iconSet"], "three-flags");
    assert_eq!(entries[3]["rule"]["iconSet"], "three-arrows");
    assert_eq!(entries[4]["rule"]["iconSet"], "three-traffic-lights");

    let (exported, export_report) =
        einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(export_report.items.is_empty(), "{:?}", export_report.items);

    let mut archive = zip::ZipArchive::new(Cursor::new(exported.clone())).unwrap();
    let mut sheet_xml = String::new();
    archive.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet_xml).unwrap();
    assert!(sheet_xml.contains(r#"iconSet="3Arrows" showValue="0" reverse="1""#));
    assert!(sheet_xml.contains(r#"<cfvo type="formula" val="_xlfn.MAXIFS($B$1:$B$5,$B$1:$B$5,&quot;&gt;0&quot;)"/>"#));
    assert!(sheet_xml.contains(r#"iconSet="3Flags""#));

    let (roundtripped_text, reimport_report) =
        einfach_xlsx::xlsx_to_native_with_report(exported, "Icons").unwrap();
    assert!(reimport_report.items.is_empty());
    let roundtripped: Value = serde_json::from_str(&roundtripped_text).unwrap();
    assert_eq!(roundtripped["workbook"]["conditionalFormats"], native["workbook"]["conditionalFormats"]);
}

#[test]
fn native_icon_set_with_default_omitted_thresholds_exports_33_and_67_percent() {
    let native = json!({
        "format": "einfach-workbook",
        "version": 1,
        "title": "DefaultIconSet",
        "canvases": [{"rowCount": 100, "colCount": 26}],
        "workbook": {
            "version": 1,
            "sheets": [{"idx": 0, "name": "Sheet1"}],
            "cells": [],
            "conditionalFormats": [{
                "sheet": 0,
                "revision": 1,
                "rules": [{
                    "id": "r1",
                    "scope": {"range": {"rowStart": 0, "rowEnd": 4, "colStart": 0, "colEnd": 0}},
                    "priority": 0,
                    "rule": {"kind": "icon-set", "iconSet": "three-flags"}
                }]
            }]
        }
    });
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(report.items.is_empty());
    let restored: Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "DefaultIconSet").unwrap())
            .unwrap();
    assert_eq!(
        restored["workbook"]["conditionalFormats"][0]["rules"][0]["rule"],
        json!({
            "kind": "icon-set",
            "iconSet": "three-flags",
            "lowerThreshold": {"type": "percent", "value": "33"},
            "upperThreshold": {"type": "percent", "value": "67"}
        })
    );
}

#[test]
fn unsupported_four_five_icon_sets_strict_gt_and_custom_icons_are_reported() {
    let rules_xml = concat!(
        r#"<cfRule type="iconSet" priority="1"><iconSet iconSet="4Arrows"><cfvo type="percent" val="0"/><cfvo type="percent" val="25"/><cfvo type="percent" val="50"/><cfvo type="percent" val="75"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="2"><iconSet iconSet="5Rating"><cfvo type="percent" val="0"/><cfvo type="percent" val="20"/><cfvo type="percent" val="40"/><cfvo type="percent" val="60"/><cfvo type="percent" val="80"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="3"><iconSet iconSet="3Arrows"><cfvo type="percent" val="0"/><cfvo type="percent" val="33" gte="0"/><cfvo type="percent" val="67"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="4"><iconSet iconSet="3Arrows" custom="1"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/><cfIcon iconSet="3Flags" iconId="0"/></iconSet></cfRule>"#,
        r#"<cfRule type="iconSet" priority="5"><iconSet iconSet="3Arrows"><cfvo type="percent" val="0"/><cfvo type="percent" val="120"/><cfvo type="percent" val="67"/></iconSet></cfRule>"#,
    );
    let (text, report) =
        einfach_xlsx::xlsx_to_native_with_report(make_xlsx(rules_xml), "Unsupported").unwrap();
    let parsed: Value = serde_json::from_str(&text).unwrap();
    assert!(parsed["workbook"].get("conditionalFormats").is_none());
    assert_eq!(
        report.items.iter().find(|i| i.kind == "conditionalFormats").map(|i| i.count),
        Some(5)
    );
}
