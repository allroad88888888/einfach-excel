#[test]
fn shift_cells_binding_records_one_history_entry_for_both_shift_kinds() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "B1", Value::Number(7.0));
    wb.workbook.set_formula(0, "D3", "=B1");
    assert!(wb.shift_cells(0, 0, 1, 0, 1, "insert-right").unwrap());
    assert_eq!(wb.workbook.get_cell("Sheet1", "C1"), Value::Number(7.0));
    assert_eq!(wb.history.undo_count(), 1);
    assert_eq!(wb.history.entries().next().unwrap().label, "Insert cells");
    assert!(wb.history_apply("undo").unwrap());
    assert_eq!(wb.workbook.get_cell("Sheet1", "B1"), Value::Number(7.0));
    assert!(wb.history_apply("redo").unwrap());
    assert!(wb.shift_cells(0, 0, 2, 0, 2, "delete-left").unwrap());
    assert_eq!(wb.workbook.get_cell("Sheet1", "C1"), Value::Null);
    assert_eq!(
        wb.workbook.get_cell("Sheet1", "D3"),
        Value::Error(einfach_core::ValueError::InvalidRef)
    );
    assert_eq!(wb.history.undo_count(), 2);
}
