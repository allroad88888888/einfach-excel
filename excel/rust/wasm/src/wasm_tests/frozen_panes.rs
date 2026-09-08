#[test]
fn freeze_binding_uses_native_history_and_sheet_identity() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Other");
    assert_eq!(wb.frozen_panes(0).unwrap(), [0, 0]);
    assert!(wb.set_frozen_panes(0, 3, 2).unwrap());
    assert!(!wb.set_frozen_panes(0, 3, 2).unwrap());
    assert_eq!(wb.history.undo_count(), 1);
    assert_eq!(wb.frozen_panes(0).unwrap(), [3, 2]);
    assert_eq!(wb.frozen_panes(1).unwrap(), [0, 0]);
    wb.history_apply("undo").unwrap();
    assert_eq!(wb.frozen_panes(0).unwrap(), [0, 0]);
    wb.history_apply("redo").unwrap();
    assert_eq!(wb.frozen_panes(0).unwrap(), [3, 2]);
}

#[test]
fn freeze_persistence_is_sparse_and_restores_without_history() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Other");
    wb.set_frozen_panes(1, 900_000, 16_000).unwrap();
    let payload = wb.snapshot_persistence_v1_json();
    assert!(payload.cells.is_empty());
    assert_eq!(payload.freeze.len(), 1);
    assert_eq!(payload.freeze[0].sheet, 1);
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(restored.frozen_panes(0).unwrap(), [0, 0]);
    assert_eq!(restored.frozen_panes(1).unwrap(), [900_000, 16_000]);
    assert_eq!(restored.history.undo_count(), 0);
}

#[test]
fn old_persistence_without_freeze_clears_existing_state() {
    let source = WasmWorkbook::new();
    let wire = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert!(wire.get("freeze").is_none());
    let mut wb = WasmWorkbook::new();
    wb.set_frozen_panes(0, 4, 3).unwrap();
    wb.restore_persistence_v1_json(serde_json::from_value(wire).unwrap())
        .unwrap();
    assert_eq!(wb.frozen_panes(0).unwrap(), [0, 0]);
}

#[test]
fn invalid_persisted_freeze_preserves_live_workbook_and_history() {
    let mut wb = WasmWorkbook::new();
    wb.set_number(0, "A1", 19.0);
    wb.set_frozen_panes(0, 2, 1).unwrap();
    let before = serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap();
    for invalid in [
        serde_json::json!([{ "sheet": 0, "rows": 1_048_576, "cols": 0 }]),
        serde_json::json!([{ "sheet": 0, "rows": 0, "cols": 16_384 }]),
        serde_json::json!([{ "sheet": 9, "rows": 1, "cols": 0 }]),
        serde_json::json!([{ "sheet": 0, "rows": 1, "cols": 0 }, { "sheet": 0, "rows": 2, "cols": 0 }]),
    ] {
        let mut wire = before.clone();
        wire["freeze"] = invalid;
        assert!(wb
            .restore_persistence_v1_json(serde_json::from_value(wire).unwrap())
            .is_err());
        assert_eq!(
            serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap(),
            before
        );
        assert_eq!(wb.history.undo_count(), 1);
    }
}
