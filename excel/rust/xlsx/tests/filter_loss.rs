use serde_json::{json, Value};
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;

fn source() -> Value {
    let rule = json!({"kind":"top","colIndex":0,"direction":"top","unit":"items","value":1});
    json!({"format":"einfach-workbook","version":1,"title":"Ranks",
        "canvases":[{"rowCount":100,"colCount":8}],"workbook":{
            "version":1,"sheets":[{"idx":0,"name":"Ranks"}],
            "cells":[{"sheet":0,"addr":"A1","row":0,"col":0,"kind":"text","value":"Score"},
                {"sheet":0,"addr":"A2","row":1,"col":0,"kind":"number","value":1},
                {"sheet":0,"addr":"A3","row":2,"col":0,"kind":"number","value":2}],
            "hidden":[{"sheet":0,"rows":[3]}],
            "filters":[{"sheet":0,"rules":[rule.clone()],"hiddenRows":[1]}],
            "tables":[{"name":"Scores","sheet":"Ranks","sheetIndex":0,"range":"A1:A3",
                "hasHeaders":true,"hasTotals":false,"columns":["Score"],
                "autoFilter":{"rules":[rule],"hiddenRows":[1]}}]
        }})
}

#[test]
fn ordinary_and_table_filter_losses_are_counted_and_only_manual_hiding_is_exported() {
    let (bytes, report) = einfach_xlsx::native_to_xlsx_with_report(&source().to_string()).unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "autoFilter").unwrap().count, 2);
    assert!(report.summary.contains("filters and filtered-row snapshots (manual hiding preserved)"));
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.clone())).unwrap();
    let mut xml = String::new();
    archive.by_name("xl/worksheets/sheet1.xml").unwrap().read_to_string(&mut xml).unwrap();
    assert!(!xml.contains("<top10"));
    let back: Value = serde_json::from_str(&einfach_xlsx::xlsx_to_native(bytes, "Ranks").unwrap()).unwrap();
    assert_eq!(back["workbook"]["hidden"][0]["rows"], json!([3]));
    assert!(back["workbook"].get("filters").is_none());
    assert!(back["workbook"]["tables"][0].get("autoFilter").is_none());
}

#[test]
fn external_autofilter_hidden_rows_are_reported_as_manual_on_import() {
    let bytes = einfach_xlsx::native_to_xlsx(&source().to_string()).unwrap();
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).unwrap();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        if entry.name() == "xl/worksheets/sheet1.xml" {
            let xml = String::from_utf8(bytes).unwrap().replace("</worksheet>",
                "<autoFilter ref=\"A1:A3\"><filterColumn colId=\"0\"><top10 val=\"1\"/></filterColumn></autoFilter></worksheet>");
            bytes = xml.into_bytes();
        }
        if entry.name() == "xl/tables/table1.xml" {
            let xml = String::from_utf8(bytes).unwrap().replace("<autoFilter ref=\"A1:A3\"/>",
                "<autoFilter ref=\"A1:A3\"><filterColumn colId=\"0\"><top10 val=\"1\"/></filterColumn></autoFilter>");
            bytes = xml.into_bytes();
        }
        writer.start_file(entry.name(), SimpleFileOptions::default()).unwrap();
        writer.write_all(&bytes).unwrap();
    }
    let (native, report) = einfach_xlsx::xlsx_to_native_with_report(
        writer.finish().unwrap().into_inner(), "External").unwrap();
    assert_eq!(report.items.iter().find(|item| item.kind == "autoFilter").unwrap().count, 2);
    assert!(report.summary.contains("hidden rows become manual; use Unhide to restore"));
    let native: Value = serde_json::from_str(&native).unwrap();
    assert_eq!(native["workbook"]["hidden"][0]["rows"], json!([3]));
}
