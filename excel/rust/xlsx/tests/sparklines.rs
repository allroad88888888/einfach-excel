//! 迷你图组 ⇄ `x14:sparklineGroups`：导出写进工作表 extLst，读回同一组设置与区域。

mod common;
use common::*;
use serde_json::{json, Value};

fn group(id: &str, location: Value, data: Value, payload: Value) -> Value {
    json!({"id": id, "kind": "sparkline",
        "anchor": {"row": location["startRow"], "col": location["startCol"], "width": 16, "height": 16},
        "refs": [location, data], "payload": payload})
}

fn reimport(bytes: Vec<u8>) -> (Vec<Value>, Vec<(String, usize)>) {
    let (native, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "Sparks").unwrap();
    let file: Value = serde_json::from_str(&native).unwrap();
    let drawings = file["workbook"]["drawings"][0]["drawings"].as_array().cloned().unwrap_or_default();
    (drawings, report.items.iter().map(|item| (item.kind.clone(), item.count)).collect())
}

#[test]
fn a_column_group_round_trips_with_its_settings() {
    let payload = json!({"type": "winLoss", "color": "#112233", "negativeColor": "#AA0000",
        "negative": true, "high": true, "axis": true});
    let exported = export(&native(vec![group("s", range(0, 6, 2, 6, None), range(0, 1, 2, 5, Some("My Data")), payload)], json!({})));
    assert!(exported.report_kinds().is_empty(), "{:?}", exported.report_kinds());
    let sheet = exported.part("xl/worksheets/sheet1.xml");
    assert!(sheet.trim_end().ends_with("</extLst></worksheet>"), "extLst is last: {sheet}");
    assert!(sheet.contains(r#"<x14:sparklineGroup type="stacked" displayEmptyCellsAs="gap" high="1" negative="1" displayXAxis="1">"#), "{sheet}");
    assert!(sheet.contains(r#"<x14:colorSeries rgb="FF112233"/>"#));
    assert!(sheet.contains("<xm:f>&apos;My Data&apos;!B2:F2</xm:f><xm:sqref>G2</xm:sqref>")
        || sheet.contains("<xm:f>'My Data'!B2:F2</xm:f><xm:sqref>G2</xm:sqref>"), "{sheet}");
    assert!(!exported.has_part("xl/drawings/drawing1.xml"));

    let (drawings, report) = reimport(exported.bytes);
    assert!(report.is_empty(), "{report:?}");
    assert_eq!(drawings.len(), 1);
    let back = &drawings[0];
    assert_eq!(back["kind"], "sparkline");
    assert_eq!(back["refs"][0], json!({"startRow": 0, "startCol": 6, "endRow": 2, "endCol": 6}));
    assert_eq!(back["refs"][1], json!({"startRow": 0, "startCol": 1, "endRow": 2, "endCol": 5, "sheetName": "My Data"}));
    assert_eq!(back["payload"]["type"], "winLoss");
    assert_eq!(back["payload"]["color"], "#112233");
    assert_eq!(back["payload"]["negative"], true);
    assert_eq!(back["payload"]["low"], false);
}

#[test]
fn mismatched_groups_are_reported_on_export() {
    let exported = export(&native(vec![group("bad", range(0, 6, 3, 6, None), range(0, 1, 1, 5, None), json!({}))], json!({})));
    assert_eq!(exported.report_kinds(), [("sparklines".to_string(), 1)]);
}
