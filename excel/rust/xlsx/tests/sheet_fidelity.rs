use std::io::{Cursor, Read, Write};

use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

fn zip_parts(parts: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, body) in parts {
        writer.start_file(*path, SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

#[test]
fn sheet_protection_permissions_protected_ranges_and_unlocked_cells_roundtrip() {
    let bytes = zip_parts(&[
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Protected" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type=".../styles" Target="styles.xml"/></Relationships>"#,
        ),
        (
            "xl/styles.xml",
            r#"<styleSheet><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf numFmtId="0"/><xf numFmtId="0" applyProtection="1"><protection locked="0"/></xf></cellXfs></styleSheet>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet>
                <sheetData>
                    <row r="2"><c r="B2" s="1"><v>1</v></c><c r="C2" s="1"><v>2</v></c></row>
                    <row r="3"><c r="B3" s="1"><v>3</v></c><c r="C3" s="1"><v>4</v></c></row>
                </sheetData>
                <sheetProtection sheet="1" sort="0" insertRows="0" deleteColumns="0" insertColumns="1" deleteRows="1"/>
                <protectedRanges><protectedRange name="InputArea" sqref="E5:F8"/></protectedRanges>
                <mergeCells count="1"><mergeCell ref="A1:A2"/></mergeCells>
            </worksheet>"#,
        ),
    ]);

    let (text, import_report) =
        einfach_xlsx::xlsx_to_native_with_report(bytes, "Prot").unwrap();
    assert!(import_report.items.is_empty(), "{:?}", import_report.items);

    let native: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(
        native["workbook"]["protection"],
        json!([{
            "sheet": 0,
            "protection": {
                "mode": "protected",
                "unlockedRanges": [
                    {"rowStart": 4, "rowEnd": 7, "colStart": 4, "colEnd": 5},
                    {"rowStart": 1, "rowEnd": 2, "colStart": 1, "colEnd": 2}
                ],
                "permissions": {
                    "sort": true,
                    "insertRows": true,
                    "insertColumns": false,
                    "deleteRows": false,
                    "deleteColumns": true
                }
            }
        }])
    );

    let (exported, export_report) =
        einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(export_report.items.is_empty(), "{:?}", export_report.items);

    let mut archive = zip::ZipArchive::new(Cursor::new(exported.clone())).unwrap();
    let mut sheet_xml = String::new();
    archive.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut sheet_xml).unwrap();
    let idx_data = sheet_xml.find("</sheetData>").unwrap();
    let idx_prot = sheet_xml.find("<sheetProtection ").unwrap();
    let idx_ranges = sheet_xml.find("<protectedRanges>").unwrap();
    let idx_merges = sheet_xml.find("<mergeCells ").unwrap();
    assert!(idx_data < idx_prot && idx_prot < idx_ranges && idx_ranges < idx_merges);

    let (restored_text, reimport_report) =
        einfach_xlsx::xlsx_to_native_with_report(exported, "Prot").unwrap();
    assert!(reimport_report.items.is_empty());
    let restored: Value = serde_json::from_str(&restored_text).unwrap();
    assert_eq!(restored["workbook"]["protection"], native["workbook"]["protection"]);
}

#[test]
fn row_and_column_outlines_roundtrip_without_polluting_manual_hidden_lists() {
    let native = json!({
        "format": "einfach-workbook",
        "version": 1,
        "title": "Outlines",
        "canvases": [{"rowCount": 100, "colCount": 26}],
        "workbook": {
            "version": 1,
            "sheets": [{"idx": 0, "name": "Sheet1"}],
            "cells": [{"sheet": 0, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Header"}],
            "hidden": [{"sheet": 0, "rows": [8]}],
            "hiddenColumns": [{"sheet": 0, "columns": [7]}],
            "outlines": [{
                "sheet": 0,
                "outline": {
                    "rows": [
                        {"start": 1, "end": 5, "collapsed": false},
                        {"start": 2, "end": 4, "collapsed": true}
                    ],
                    "columns": [
                        {"start": 1, "end": 3, "collapsed": true}
                    ]
                }
            }]
        }
    });

    let (bytes, export_report) =
        einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(export_report.items.is_empty(), "{:?}", export_report.items);

    let (restored_text, import_report) =
        einfach_xlsx::xlsx_to_native_with_report(bytes, "Outlines").unwrap();
    assert!(import_report.items.is_empty(), "{:?}", import_report.items);
    let restored: Value = serde_json::from_str(&restored_text).unwrap();
    assert_eq!(restored["workbook"]["outlines"], native["workbook"]["outlines"]);
    assert_eq!(restored["workbook"]["hidden"], json!([{"sheet": 0, "rows": [8]}]));
    assert_eq!(restored["workbook"]["hiddenColumns"], json!([{"sheet": 0, "columns": [7]}]));

    // Hand-authored `<row outlineLevel="1" collapsed="1"/>` & `<col ... outlineLevel="1" collapsed="1"/>`
    let hand_bytes = zip_parts(&[
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hand" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet><cols><col min="2" max="4" outlineLevel="1" collapsed="1"/></cols><sheetData><row r="3" outlineLevel="1" collapsed="1"/></sheetData></worksheet>"#,
        ),
    ]);
    let hand_native: Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(hand_bytes, "Hand").unwrap()).unwrap();
    assert_eq!(
        hand_native["workbook"]["outlines"][0]["outline"],
        json!({
            "rows": [{"start": 2, "end": 2, "collapsed": true}],
            "columns": [{"start": 1, "end": 3, "collapsed": true}]
        })
    );
}

#[test]
fn sheet_visibility_tab_color_and_cell_text_rotation_roundtrip_cleanly() {
    let native = json!({
        "format": "einfach-workbook",
        "version": 1,
        "title": "VisualFidelity",
        "canvases": [
            {"rowCount": 100, "colCount": 26},
            {"rowCount": 100, "colCount": 26}
        ],
        "workbook": {
            "version": 1,
            "sheets": [
                {"idx": 0, "name": "Visible", "tabColor": "#FF8800", "defaults": {"rowHeight": 28}},
                {"idx": 1, "name": "Archived", "hidden": true, "tabColor": "#3366CC", "defaults": {"rowHeight": 28}}
            ],
            "cells": [
                {"sheet": 0, "addr": "A1", "row": 0, "col": 0, "kind": "text", "value": "Up"},
                {"sheet": 0, "addr": "B1", "row": 0, "col": 1, "kind": "text", "value": "Down"},
                {"sheet": 0, "addr": "C1", "row": 0, "col": 2, "kind": "text", "value": "Stacked"}
            ],
            "formats": [{
                "sheet": 0,
                "startRow": 0,
                "startCol": 0,
                "endRow": 10,
                "endCol": 10,
                "cellStyles": [
                    {"addr": "A1", "format": {"rotation": 45}},
                    {"addr": "B1", "format": {"rotation": -60}},
                    {"addr": "C1", "format": {"rotation": "vertical"}}
                ],
                "rowStyles": [],
                "columnStyles": []
            }]
        }
    });

    let (bytes, export_report) =
        einfach_xlsx::native_to_xlsx_with_report(&native.to_string()).unwrap();
    assert!(export_report.items.is_empty(), "{:?}", export_report.items);

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
    let mut wb_xml = String::new();
    archive.by_name("xl/workbook.xml").unwrap().read_to_string(&mut wb_xml).unwrap();
    assert!(wb_xml.contains(r#"<sheet name="Archived" sheetId="2" state="hidden" r:id="rId2"/>"#));
    let mut styles_xml = String::new();
    archive.by_name("xl/styles.xml").unwrap().read_to_string(&mut styles_xml).unwrap();
    assert!(styles_xml.contains(r#"textRotation="45""#));
    assert!(styles_xml.contains(r#"textRotation="150""#));
    assert!(styles_xml.contains(r#"textRotation="255""#));

    let (restored_text, import_report) =
        einfach_xlsx::xlsx_to_native_with_report(bytes, "VisualFidelity").unwrap();
    assert!(import_report.items.is_empty(), "{:?}", import_report.items);
    let restored: Value = serde_json::from_str(&restored_text).unwrap();
    assert_eq!(restored["workbook"]["sheets"], native["workbook"]["sheets"]);
    assert_eq!(
        restored["workbook"]["formats"][0]["cellStyles"],
        native["workbook"]["formats"][0]["cellStyles"]
    );

    // If a corrupt XLSX marks every sheet hidden/veryHidden, at least the first sheet stays visible.
    let all_hidden_bytes = zip_parts(&[
        (
            "xl/workbook.xml",
            r#"<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Only" sheetId="1" state="veryHidden" r:id="rId1"/></sheets></workbook>"#,
        ),
        (
            "xl/_rels/workbook.xml.rels",
            r#"<Relationships><Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#,
        ),
        (
            "xl/worksheets/sheet1.xml",
            r#"<worksheet><sheetPr><tabColor theme="4"/></sheetPr><sheetData/></worksheet>"#,
        ),
    ]);
    let safe_native: Value =
        serde_json::from_str(&einfach_xlsx::xlsx_to_native(all_hidden_bytes, "Safe").unwrap())
            .unwrap();
    assert!(safe_native["workbook"]["sheets"][0].get("hidden").is_none());
    assert_eq!(safe_native["workbook"]["sheets"][0]["tabColor"], "#4472C4");
}
