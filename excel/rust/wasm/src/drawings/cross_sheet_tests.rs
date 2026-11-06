#[cfg(test)]
mod drawing_cross_sheet_persistence_tests {
    use super::*;
    use einfach_excel_core::drawings::{DrawingAnchor, DrawingRange, SheetDrawing};

    fn chart(refs: Vec<Option<DrawingRange>>) -> SheetDrawing {
        SheetDrawing {
            id: "c".to_owned(),
            kind: "chart".to_owned(),
            anchor: DrawingAnchor {
                row: 1,
                col: 1,
                offset_x: 0,
                offset_y: 0,
                width: 100,
                height: 80,
            },
            refs,
            payload: serde_json::json!({}),
        }
    }

    fn range(sheet: Option<u64>) -> DrawingRange {
        DrawingRange {
            start_row: 0,
            start_col: 0,
            end_row: 4,
            end_col: 1,
            sheet,
        }
    }

    fn book_with_cross_sheet_ref() -> (WasmWorkbook, u64) {
        let mut book = WasmWorkbook::new();
        book.workbook.add_sheet("Data");
        let key = book.workbook.sheet_key(1).unwrap();
        let refs = vec![Some(range(Some(key))), Some(range(None))];
        book.workbook
            .sheet_mut(0)
            .unwrap()
            .set_drawing(chart(refs))
            .unwrap();
        (book, key)
    }

    #[test]
    fn cross_sheet_references_round_trip_by_sheet_name() {
        let (source, _) = book_with_cross_sheet_ref();
        let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        let refs = &json["drawings"][0]["drawings"][0]["refs"];
        assert_eq!(refs[0]["sheetName"], "Data");
        assert!(refs[0].get("sheet").is_none());
        assert!(refs[1].get("sheetName").is_none());
        let mut restored = WasmWorkbook::new();
        restored
            .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
            .unwrap();
        let key = restored.workbook.sheet_key(1).unwrap();
        let refs = restored.workbook.sheet(0).unwrap().drawings()[0]
            .refs
            .clone();
        assert_eq!(refs, vec![Some(range(Some(key))), Some(range(None))]);
    }

    #[test]
    fn a_reference_to_a_deleted_sheet_is_exported_as_null() {
        let (mut source, _) = book_with_cross_sheet_ref();
        source.workbook.remove_sheet(1);
        let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        let refs = &json["drawings"][0]["drawings"][0]["refs"];
        assert!(refs[0].is_null());
        assert!(refs[1].is_object());
    }

    #[test]
    fn unknown_or_own_sheet_names_resolve_to_none_on_import() {
        let (source, _) = book_with_cross_sheet_ref();
        let mut json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        json["drawings"][0]["drawings"][0]["refs"][0]["sheetName"] = "Missing".into();
        json["drawings"][0]["drawings"][0]["refs"][1]["sheetName"] = "Sheet1".into();
        let mut restored = WasmWorkbook::new();
        restored
            .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
            .unwrap();
        let refs = restored.workbook.sheet(0).unwrap().drawings()[0]
            .refs
            .clone();
        assert_eq!(refs, vec![None, Some(range(None))]);
    }

    #[test]
    fn a_legacy_file_without_sheet_names_reads_as_same_sheet() {
        let json = serde_json::json!({
            "sheet": 0,
            "drawings": [{
                "id": "old", "kind": "chart",
                "anchor": { "row": 0, "col": 0, "width": 10, "height": 10 },
                "refs": [{ "startRow": 0, "startCol": 0, "endRow": 2, "endCol": 0 }],
                "payload": {}
            }]
        });
        let entry: SheetDrawingsJSON = serde_json::from_value(json).unwrap();
        let mut target = WasmWorkbook::new();
        WasmWorkbook::restore_drawings_json(&mut target.workbook, vec![entry]).unwrap();
        let refs = target.workbook.sheet(0).unwrap().drawings()[0].refs.clone();
        assert_eq!(refs[0].unwrap().sheet, None);
    }
}
