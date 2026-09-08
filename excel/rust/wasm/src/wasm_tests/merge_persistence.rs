#[test]
fn merge_persistence_roundtrip_keeps_sparse_geometry_and_lazy_anchor_formula() {
    let mut source = WasmWorkbook::new();
    source.set_number(0, "E1", 7.0);
    assert!(source.set_formula(0, "A1", "=E1*2"));
    assert!(source.merge_cells(0, 0, 0, 1, 2, "center", false).unwrap());
    source.add_sheet("Empty merge");
    assert!(source
        .merge_cells(1, 900_000, 100, 999_999, 200, "merge", false)
        .unwrap());
    let payload = source.snapshot_persistence_v1_json();
    let cell_count = payload.cells.len();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(payload).unwrap();

    assert_eq!(restored.merged_ranges(0).unwrap(), vec![0, 0, 1, 2]);
    assert_eq!(
        restored.merged_ranges(1).unwrap(),
        vec![900_000, 100, 999_999, 200]
    );
    assert_eq!(
        restored.snapshot_persistence_v1_json().cells.len(),
        cell_count
    );
    assert_eq!(restored.debug_formula_eval_count(0), 0);
    assert_eq!(restored.get_formula(0, "A1"), "=E1*2");
    assert_eq!(restored.get_number(0, "A1"), 14.0);
    assert_eq!(
        restored
            .workbook
            .sheet(0)
            .unwrap()
            .effective_format("A1")
            .align,
        Align::Center
    );
}

#[test]
fn legacy_persistence_without_merges_clears_old_geometry() {
    let source = WasmWorkbook::new();
    let mut wire = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert!(wire.get("merges").is_none());
    wire.as_object_mut().unwrap().remove("merges");
    let mut restored = WasmWorkbook::new();
    assert!(restored.merge_cells(0, 0, 0, 1, 1, "merge", false).unwrap());
    restored
        .restore_persistence_v1_json(serde_json::from_value(wire).unwrap())
        .unwrap();
    assert!(restored.merged_ranges(0).unwrap().is_empty());
}

#[test]
fn invalid_merge_persistence_never_replaces_the_live_workbook() {
    for invalid in [
        serde_json::json!([{ "sheet": 1, "ranges": [[0, 0, 1, 1]] }]),
        serde_json::json!([{ "sheet": 0, "ranges": [[2, 0, 1, 1]] }]),
        serde_json::json!([{ "sheet": 0, "ranges": [[0, 0, 1_048_576, 1]] }]),
        serde_json::json!([{ "sheet": 0, "ranges": [[0, 0, 1, 16_384]] }]),
        serde_json::json!([{ "sheet": 0, "ranges": [[0, 0, 0, 0]] }]),
        serde_json::json!([{ "sheet": 0, "ranges": [[0, 0, 1, 1], [1, 1, 2, 2]] }]),
        serde_json::json!([
            { "sheet": 0, "ranges": [[0, 0, 1, 1]] },
            { "sheet": 0, "ranges": [[3, 3, 4, 4]] }
        ]),
    ] {
        let mut source = WasmWorkbook::new();
        source.set_number(0, "E1", 99.0);
        let mut wire = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        wire["merges"] = invalid;
        let mut live = WasmWorkbook::new();
        live.rename_sheet(0, "Keep");
        live.set_text(0, "A1", "Keep me");
        live.merge_cells(0, 0, 0, 1, 1, "merge", false).unwrap();
        let before = serde_json::to_value(live.snapshot_persistence_v1_json()).unwrap();
        let result = live.restore_persistence_v1_json(serde_json::from_value(wire).unwrap());
        assert!(result.is_err(), "invalid merged geometry must be rejected");
        assert_eq!(
            serde_json::to_value(live.snapshot_persistence_v1_json()).unwrap(),
            before
        );
    }
}

#[test]
fn persistence_rejects_hidden_values_or_formulas_under_a_merge() {
    for formula in [false, true] {
        let mut source = WasmWorkbook::new();
        if formula {
            source.set_formula(0, "B2", "=1+1");
        } else {
            source.set_text(0, "B2", "Hidden");
        }
        let mut wire = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        wire["merges"] = serde_json::json!([{ "sheet": 0, "ranges": [[0, 0, 1, 1]] }]);
        let mut live = WasmWorkbook::new();
        live.set_number(0, "A1", 42.0);
        assert!(live
            .restore_persistence_v1_json(serde_json::from_value(wire).unwrap())
            .is_err());
        assert_eq!(live.get_number(0, "A1"), 42.0);
    }
}

#[test]
fn restored_merge_blocks_array_spill_until_unmerge() {
    let mut source = WasmWorkbook::new();
    source.merge_cells(0, 0, 1, 1, 2, "merge", false).unwrap();
    source.set_formula(0, "A1", "=SEQUENCE(1,3)");
    assert_eq!(source.get_display(0, "A1"), "#SPILL!");
    let mut restored = WasmWorkbook::new();
    let payload = source.snapshot_persistence_v1_json();
    assert_eq!(payload.cells.len(), 1, "{:?}", payload.cells);
    restored
        .restore_persistence_v1_json(payload)
        .unwrap();
    assert_eq!(restored.get_display(0, "A1"), "#SPILL!");
    restored
        .merge_cells(0, 0, 1, 1, 2, "unmerge", false)
        .unwrap();
    assert_eq!(restored.get_number(0, "C1"), 3.0);
}

#[test]
fn successful_restore_clears_old_history_and_clipboard_but_failure_preserves_them() {
    let mut live = WasmWorkbook::new();
    live.merge_cells(0, 0, 0, 1, 1, "merge", false).unwrap();
    live.clipboard = Some(
        live.workbook
            .capture_clipboard(
                0,
                CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 1)),
                false,
            )
            .unwrap(),
    );
    let mut payload = live.snapshot_persistence_v1_json();
    payload.merges[0].ranges.push([1, 1, 2, 2]);
    assert!(live.restore_persistence_v1_json(payload).is_err());
    assert_eq!(live.history.undo_count(), 1);
    assert!(live.clipboard.is_some());
    live.restore_persistence_v1_json(live.snapshot_persistence_v1_json())
        .unwrap();
    assert_eq!(live.history.undo_count(), 0);
    assert!(live.clipboard.is_none());
    assert!(!live.history_apply("undo").unwrap());
    assert_eq!(live.merged_ranges(0).unwrap(), vec![0, 0, 1, 1]);
}
