/// 不依赖浏览器序列化，直接验证确认动作只提升/释放暂存槽，不改变历史。
#[test]
fn clipboard_confirmation_preserves_last_success_on_failure_and_releases_pending() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "A1", Value::Number(7.0));
    wb.workbook.set_cell(0, "B1", Value::Number(9.0));
    let original = CellRange::single(CellAddress::new(0, 0));
    let next = CellRange::single(CellAddress::new(0, 1));
    wb.clipboard = Some(wb.workbook.capture_clipboard(0, original, false).unwrap());
    wb.pending_clipboard = Some(wb.workbook.capture_clipboard(0, next, true).unwrap());
    wb.finish_clipboard_capture(false);
    assert_eq!(wb.clipboard.as_ref().unwrap().text(), "7");
    assert!(wb.pending_clipboard.is_none());
    wb.pending_clipboard = Some(wb.workbook.capture_clipboard(0, next, true).unwrap());
    wb.finish_clipboard_capture(true);
    assert_eq!(wb.clipboard.as_ref().unwrap().text(), "9");
    assert!(wb.pending_clipboard.is_none());
    // 重复确认没有待提升快照，不能清空已成功内容。
    wb.finish_clipboard_capture(true);
    assert_eq!(wb.clipboard.as_ref().unwrap().text(), "9");
    assert_eq!(wb.workbook.get_cell("Sheet1", "B1"), Value::Number(9.0));
    assert_eq!(wb.history.undo_count(), 0);
}
