// 保存原始分组与手动隐藏，恢复后展开仍能正确区分两种来源。
#[test]
fn outline_roundtrip_keeps_nested_axes_visibility_and_native_calculation() {
    use einfach_excel_core::outline::{OutlineAction as Action, OutlineAxis as Axis};
    let mut source = WasmWorkbook::new();
    for row in 1..=6 { source.set_number(0, &format!("A{row}"), 1.0); }
    source.workbook.set_formula(0, "B1", "=SUBTOTAL(109,A1:A6)");
    source.workbook.hide_rows(0, &[3]);
    source.history.set_visibility(&mut source.workbook, 0,
        CellRange::single(CellAddress::new(0, 3)), "hide-columns").unwrap();
    for axis in [Axis::Row, Axis::Column] {
        for (start, end) in [(1, 4), (2, 3)] {
            source.history.change_outline(&mut source.workbook, 0, axis, Action::Group { start, end }).unwrap();
        }
        source.history.change_outline(&mut source.workbook, 0, axis, Action::ShowLevel { level: 1 }).unwrap();
    }
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["outlines"][0]["outline"]["rows"].as_array().unwrap().len(), 2);
    assert!(json["outlines"][0].get("outlineRows").is_none());
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(json).unwrap()).unwrap();
    assert_eq!(restored.history.undo_count(), 0);
    assert_eq!(restored.workbook.sheet(0).unwrap().outline(), source.workbook.sheet(0).unwrap().outline());
    let visibility = restored.sheet_visibility_json(0).unwrap();
    assert_eq!(visibility.manual_rows, vec![3]);
    assert_eq!(visibility.manual_columns, vec![3]);
    assert_eq!(visibility.outline_rows, vec![1, 2, 3, 4]);
    assert_eq!(visibility.outline_columns, vec![1, 2, 3, 4]);
    assert_eq!(restored.workbook.get_cell("Sheet1", "B1"), Value::Number(2.0));
    restored.history.change_outline(&mut restored.workbook, 0, Axis::Row, Action::ShowLevel { level: 9 }).unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "B1"), Value::Number(5.0));
    assert_eq!(restored.workbook.list_hidden_rows(0), vec![3]);
}

#[test]
fn outline_restore_rejects_invalid_metadata_without_losing_workbook_or_history() {
    use einfach_excel_core::outline::{OutlineAction, OutlineAxis};
    let mut book = WasmWorkbook::new();
    book.set_number(0, "A1", 42.0);
    book.history.change_outline(&mut book.workbook, 0, OutlineAxis::Row,
        OutlineAction::Group { start: 1, end: 3 }).unwrap();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let valid = serde_json::json!({"sheet":0,"outline":{"rows":[],"columns":[]}});
    for outlines in [
        serde_json::json!([{"sheet":99,"outline":{"rows":[],"columns":[]}}]),
        serde_json::json!([valid.clone(), valid.clone()]),
        serde_json::json!([{"sheet":0,"outline":{"rows":[{"start":4,"end":3,"collapsed":false}],"columns":[]}}]),
        serde_json::json!([{"sheet":0,"outline":{"rows":[{"start":0,"end":1048576,"collapsed":false}],"columns":[]}}]),
        serde_json::json!([{"sheet":0,"outline":{"rows":[
            {"start":1,"end":4,"collapsed":false},{"start":3,"end":6,"collapsed":true}],"columns":[]}}]),
    ] {
        let mut invalid = before.clone();
        invalid["outlines"] = outlines;
        assert!(book.restore_persistence_v1_json(serde_json::from_value(invalid).unwrap()).is_err());
        assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), before);
        assert_eq!(book.history.undo_count(), 1);
    }
}

#[test]
fn empty_outline_preserves_old_wire_shape_and_actions_reject_extra_fields() {
    let book = WasmWorkbook::new();
    let old = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    assert!(old.get("outlines").is_none());
    let visibility = serde_json::to_value(book.sheet_visibility_json(0).unwrap()).unwrap();
    assert!(visibility.get("outline").is_none());
    assert!(visibility.get("outlineRows").is_none());
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(old).unwrap()).unwrap();
    assert!(restored.workbook.sheet(0).unwrap().outline().rows.is_empty());
    for bad in [
        serde_json::json!({"kind":"group","start":1,"end":3,"collapsed":true}),
        serde_json::json!({"kind":"group","start":-1,"end":3}),
        serde_json::json!({"kind":"set-collapsed","index":0.5,"collapsed":true}),
        serde_json::json!({"kind":"unknown"}),
    ] {
        assert!(serde_json::from_value::<einfach_excel_core::outline::OutlineAction>(bad).is_err());
    }
}
