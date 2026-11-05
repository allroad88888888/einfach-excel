#[test]
fn sheet_view_flags_round_trip_through_persistence() {
    let mut source = WasmWorkbook::new();
    source.add_sheet("Second");
    assert_eq!(source.sheet_view_flags(0), 0);
    assert!(source.set_sheet_view(1, true, false).ok().unwrap());
    assert!(!source.set_sheet_view(1, true, false).ok().unwrap(), "same options report no change");
    assert!(source.set_sheet_view(0, false, true).ok().unwrap());
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(saved["sheets"][1]["hideGridlines"], true);
    assert!(saved["sheets"][1].get("hideHeadings").is_none(), "visible options add no field");
    assert_eq!(saved["sheets"][0]["hideHeadings"], true);

    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert_eq!(restored.sheet_view_flags(0), 0b10);
    assert_eq!(restored.sheet_view_flags(1), 0b01);
}

#[test]
fn sheet_view_changes_skip_undo_but_count_as_a_mutation() {
    let mut wb = WasmWorkbook::new();
    let undo_before = wb.history.undo_count();
    let sequence = wb.history.mutation_sequence();
    assert!(wb.set_sheet_view(0, true, true).ok().unwrap());
    assert_eq!(wb.history.undo_count(), undo_before);
    assert_eq!(wb.history.mutation_sequence(), sequence + 1);
}
