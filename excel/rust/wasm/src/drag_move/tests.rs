use super::*;

#[test]
fn drag_move_keeps_the_user_clipboard_and_undoes_in_one_step() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "A1", Value::Number(7.0));
    wb.workbook.set_formula(0, "C1", "=A1+1");
    wb.clipboard = Some(
        wb.workbook
            .capture_clipboard(0, CellRange::single(CellAddress::new(0, 2)), false)
            .unwrap(),
    );
    let moved = wb
        .drag_transfer_range(0, 0, 0, 0, 0, 4, 1, false, false, 1_048_576, 16_384)
        .unwrap();
    assert_eq!(moved, vec![4, 1, 4, 1]);
    assert_eq!(wb.workbook.get_cell("Sheet1", "B5"), Value::Number(7.0));
    assert_eq!(wb.workbook.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(
        wb.workbook.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=(B5+1)")
    );
    assert_eq!(wb.clipboard.as_ref().unwrap().text(), "8");
    assert_eq!(wb.history.undo_count(), 1);
    assert!(wb.history_apply("undo").unwrap());
    assert_eq!(wb.workbook.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(wb.workbook.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn confirmed_drag_copy_replaces_data_and_keeps_the_source() {
    // 未确认的拒绝路径会构造 JsValue，原生测试里不可用；它由 excel-core 的单元测试覆盖。
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "A1", Value::Number(1.0));
    wb.workbook.set_cell(0, "A2", Value::Number(2.0));
    wb.drag_transfer_range(0, 0, 0, 0, 0, 1, 0, true, true, 1_048_576, 16_384)
        .unwrap();
    assert_eq!(wb.workbook.get_cell("Sheet1", "A2"), Value::Number(1.0));
    assert_eq!(wb.workbook.get_cell("Sheet1", "A1"), Value::Number(1.0));
}
