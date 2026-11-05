#[test]
fn persistence_preserves_sparse_defaults_and_rejects_invalid_defaults_atomically() {
    let mut book = WasmWorkbook::new();
    let defaults = einfach_excel_core::sheet::SheetDefaults {
        row_height: Some(36), col_width: Some(160), font_size: Some(18),
    };
    book.workbook.sheet_mut(0).unwrap().set_defaults(defaults).unwrap();
    book.set_number(0, "A1", 7.0);
    let snapshot = book.snapshot_persistence_v1_json();
    assert_eq!(snapshot.cells.len(), 1);
    assert!(snapshot.sizes.is_empty());
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(snapshot).unwrap();
    assert_eq!(restored.workbook.sheet(0).unwrap().defaults(), defaults);
    let mut invalid = restored.snapshot_persistence_v1_json();
    invalid.sheets[0].defaults.row_height = Some(0);
    assert!(restored.restore_persistence_v1_json(invalid).is_err());
    assert_eq!(restored.workbook.sheet(0).unwrap().defaults(), defaults);
}
