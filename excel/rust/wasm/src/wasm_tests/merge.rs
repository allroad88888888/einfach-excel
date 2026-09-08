// WASM 合并入口必须复用原生历史，不通过多次写入拼出一个用户动作。
#[test]
fn merge_binding_roundtrips_all_three_actions_with_native_history() {
    for action in ["merge", "center"] {
        let mut wb = WasmWorkbook::new();
        wb.workbook.set_cell(0, "A1", Value::Number(4.0));
        wb.workbook.set_cell(0, "B1", Value::Number(8.0));
        assert!(wb.merge_cells(0, 0, 0, 1, 2, action, true).unwrap());
        assert_eq!(wb.merged_ranges(0).unwrap(), vec![0, 0, 1, 2]);
        assert_eq!(wb.history.undo_count(), 1);
        assert_eq!(wb.workbook.get_cell("Sheet1", "B1"), Value::Null);
        assert_eq!(
            wb.workbook.sheet(0).unwrap().effective_format("A1").align == Align::Center,
            action == "center"
        );
        assert!(wb.merge_cells(0, 1, 2, 1, 2, "unmerge", false).unwrap());
        assert!(wb.merged_ranges(0).unwrap().is_empty());
        assert!(wb.history_apply("undo").unwrap());
        assert_eq!(wb.merged_ranges(0).unwrap(), vec![0, 0, 1, 2]);
        assert!(wb.history_apply("undo").unwrap());
        assert!(wb.merged_ranges(0).unwrap().is_empty());
        assert_eq!(wb.workbook.get_cell("Sheet1", "B1"), Value::Number(8.0));
        assert!(wb.history_apply("redo").unwrap());
        assert_eq!(wb.merged_ranges(0).unwrap(), vec![0, 0, 1, 2]);
    }
}

#[test]
fn merge_binding_returns_empty_and_offscreen_geometry_without_materializing_cells() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.merged_ranges(0).unwrap().is_empty());
    assert!(wb.merge_cells(0, 50, 30, 100, 40, "merge", false).unwrap());
    assert_eq!(wb.merged_ranges(0).unwrap(), vec![50, 30, 100, 40]);
    assert!(!wb.merge_cells(0, 50, 30, 100, 40, "merge", false).unwrap());
    assert_eq!(wb.history.undo_count(), 1);
    wb.edit_structure(0, "insert-rows", 75, 2).unwrap();
    assert_eq!(wb.merged_ranges(0).unwrap(), vec![50, 30, 102, 40]);
    wb.history_apply("undo").unwrap();
    assert_eq!(wb.merged_ranges(0).unwrap(), vec![50, 30, 100, 40]);
}
