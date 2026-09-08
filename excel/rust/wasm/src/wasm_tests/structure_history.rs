#[test]
fn structure_binding_uses_one_native_history_entry_for_every_axis_edit() {
    for action in [
        "insert-rows",
        "delete-rows",
        "insert-columns",
        "delete-columns",
    ] {
        let mut wb = WasmWorkbook::new();
        wb.workbook.set_cell(0, "A2", Value::Number(7.0));
        assert!(wb.edit_structure(0, action, 0, 1).unwrap());
        assert_eq!(wb.history.undo_count(), 1);
        let entry = wb.history.entries().next().unwrap();
        let edit = StructuralEditJSON::from(entry.structural_edit().unwrap());
        assert_eq!((edit.action, edit.at, edit.count), (action, 0, 1));
        assert!(!entry.is_sheet_change());
        assert!(wb.history_apply("undo").unwrap());
        assert_eq!(wb.workbook.get_cell("Sheet1", "A2"), Value::Number(7.0));
        assert!(wb.history_apply("redo").unwrap());
    }
}

#[test]
fn structure_binding_invalidates_clipboard_only_when_structure_changes() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "A2", Value::Number(7.0));
    let range = CellRange::new(CellAddress::new(1, 0), CellAddress::new(1, 0));
    wb.clipboard = Some(wb.workbook.capture_clipboard(0, range, true).unwrap());
    assert!(!wb.edit_structure(0, "insert-rows", 0, 0).unwrap());
    assert!(wb.clipboard.is_some());
    wb.edit_structure(0, "insert-rows", 0, 1).unwrap();
    assert!(wb.clipboard.is_none());
    wb.clipboard = Some(wb.workbook.capture_clipboard(0, range, false).unwrap());
    wb.history_apply("undo").unwrap();
    assert!(wb.clipboard.is_none());
}
