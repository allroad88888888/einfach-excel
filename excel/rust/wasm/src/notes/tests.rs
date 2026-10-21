use super::*;

#[test]
fn note_native_file_roundtrip_keeps_multiline_and_empty_cells() {
    let mut source = WasmWorkbook::new();
    source.set_text(0, "A1", "neighbor");
    source
        .change_note(0, 40, 2, Some("第一行\nsecond line".into()))
        .unwrap();
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["notes"][0]["text"], "第一行\nsecond line");
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json.clone()).unwrap())
        .unwrap();
    assert_eq!(
        restored
            .workbook
            .sheet(0)
            .unwrap()
            .note(CellAddress::new(40, 2)),
        Some("第一行\nsecond line")
    );
    assert_eq!(restored.get_display(0, "A1"), "neighbor");
    let mut cells = Vec::new();
    restored.append_note_cells(0, CellRange::single(CellAddress::new(40, 2)), &mut cells);
    assert_eq!(cells.len(), 1);
    assert_eq!(cells[0].note_indicator, Some(true));
    assert_eq!(cells[0].cell_type, "null");
    let mut legacy = json;
    legacy.as_object_mut().unwrap().remove("notes");
    restored
        .restore_persistence_v1_json(serde_json::from_value(legacy).unwrap())
        .unwrap();
    assert!(restored.notes_json().is_empty());
}

#[test]
fn note_file_metadata_rejects_duplicate_empty_and_outside_records() {
    for notes in [
        vec![(0, 0, 0, "a"), (0, 0, 0, "b")],
        vec![(0, 0, 0, " ")],
        vec![(0, 1_048_576, 0, "a")],
        vec![(2, 0, 0, "a")],
    ] {
        let mut book = Workbook::new();
        let notes = notes
            .into_iter()
            .map(|(sheet, row, col, text)| NoteJSON {
                sheet,
                row,
                col,
                text: text.into(),
            })
            .collect();
        assert!(WasmWorkbook::restore_notes_json(&mut book, notes).is_err());
    }
}

#[test]
fn malformed_note_file_does_not_replace_open_workbook() {
    let mut book = WasmWorkbook::new();
    book.set_text(0, "A1", "keep me");
    book.change_note(0, 1, 1, Some("existing".into())).unwrap();
    let mut json = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    json["notes"] = serde_json::json!([{ "sheet": 0, "row": 0, "col": 0, "text": " " }]);
    assert!(book
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .is_err());
    assert_eq!(book.get_display(0, "A1"), "keep me");
    assert_eq!(
        book.workbook.sheet(0).unwrap().note(CellAddress::new(1, 1)),
        Some("existing")
    );
}
