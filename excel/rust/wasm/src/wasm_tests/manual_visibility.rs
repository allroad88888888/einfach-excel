#[test]
fn visibility_binding_uses_native_history_for_both_axes() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.set_visibility(0, 1, 2, 3, 4, "hide-rows").unwrap());
    assert!(wb.set_visibility(0, 1, 2, 3, 4, "hide-columns").unwrap());
    let state = wb.workbook.sheet_visibility(0).unwrap();
    assert_eq!(state.rows, vec![1, 2, 3]);
    assert_eq!(state.columns, vec![2, 3, 4]);
    assert_eq!(wb.history.undo_count(), 2);
    assert!(wb.history_apply("undo").unwrap());
    assert!(wb.workbook.sheet_visibility(0).unwrap().columns.is_empty());
    assert_eq!(wb.workbook.sheet_visibility(0).unwrap().rows, state.rows);
    assert!(wb.history_apply("redo").unwrap());
    assert_eq!(wb.workbook.sheet_visibility(0).unwrap(), state);
}

#[test]
fn visibility_binding_restores_only_requested_range_in_one_history_step() {
    let mut wb = WasmWorkbook::new();
    wb.set_visibility(0, 0, 0, 9, 9, "hide-rows").unwrap();
    wb.set_visibility(0, 0, 0, 9, 9, "hide-columns").unwrap();
    wb.set_visibility(0, 1, 2, 2, 3, "unhide").unwrap();
    let state = wb.workbook.sheet_visibility(0).unwrap();
    assert!(!state.rows.contains(&1));
    assert!(!state.columns.contains(&2));
    assert!(state.rows.contains(&0));
    assert!(state.columns.contains(&1));
    assert_eq!(wb.history.undo_count(), 3);
    wb.history_apply("undo").unwrap();
    assert_eq!(wb.workbook.sheet_visibility(0).unwrap().rows.len(), 10);
    assert_eq!(wb.workbook.sheet_visibility(0).unwrap().columns.len(), 10);
}
#[test]
fn manual_column_persistence_roundtrip_and_invalid_metadata_are_atomic() {
    let mut book = WasmWorkbook::new();
    book.set_number(0, "D1", 7.0);
    book.history.set_visibility(&mut book.workbook, 0,
        CellRange::single(CellAddress::new(0, 3)), "hide-columns").unwrap();
    let saved = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(saved["hiddenColumns"], serde_json::json!([{"sheet":0,"columns":[3]}]));
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved.clone()).unwrap()).unwrap();
    assert_eq!(restored.workbook.sheet_visibility(0).unwrap().columns, vec![3]);
    assert_eq!(restored.workbook.get_cell("Sheet1", "D1"), Value::Number(7.0));
    for invalid in [
        serde_json::json!([{"sheet":0,"columns":[16384]}]),
        serde_json::json!([{"sheet":0,"columns":[2,1]}]),
        serde_json::json!([{"sheet":0,"columns":[1,1]}]),
        serde_json::json!([{"sheet":99,"columns":[1]}]),
        serde_json::json!([{"sheet":0,"columns":[1]},{"sheet":0,"columns":[2]}]),
    ] {
        let mut bad = saved.clone();
        bad["hiddenColumns"] = invalid;
        assert!(book.restore_persistence_v1_json(serde_json::from_value(bad).unwrap()).is_err());
        assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), saved);
        assert_eq!(book.history.undo_count(), 1);
    }
}
