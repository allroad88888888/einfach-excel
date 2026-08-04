/// A1:A5 = 1..5 with `C1 = SUBTOTAL(109, A1:A5)` on sheet 0, plus a
/// second sheet so the per-sheet keying is exercised.
fn workbook_with_hidden_rows() -> WasmWorkbook {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Second");
    for i in 0..5u32 {
        wb.set_number(0, &format!("A{}", i + 1), (i + 1) as f64);
    }
    assert!(wb.set_formula(0, "C1", "=SUBTOTAL(109, A1:A5)"));
    wb
}

/// **Counterexample.** Hidden rows must survive a persistence round trip.
///
/// Until the engine owned the set there was nothing on this side of the
/// boundary to serialize: `snapshot_persistence_v1` had no hidden field
/// and `restore_persistence_v1` builds a FRESH `Workbook`, so every
/// save/load silently un-hid every row. This fails on the unfixed engine
/// with a WRONG SUBTOTAL — 15 instead of 9 — not with an error.
#[test]
fn wasm_persistence_v1_round_trips_manually_hidden_rows() {
    let mut source = workbook_with_hidden_rows();
    assert!(source.hide_rows(0, vec![1, 3])); // A2 = 2, A4 = 4
    assert!(source.hide_rows(1, vec![7]));
    assert_eq!(source.get_number(0, "C1"), 9.0); // 15 - 2 - 4

    let envelope = source.snapshot_persistence_v1_json();
    assert_eq!(envelope.hidden.len(), 2, "both sheets carried");

    let mut restored = WasmWorkbook::new();
    let stats = restored
        .restore_persistence_v1_json(envelope)
        .expect("restore");
    assert_eq!(stats.restored_hidden_sheets, 2);
    assert_eq!(restored.list_hidden_rows(0), vec![1, 3]);
    assert_eq!(restored.list_hidden_rows(1), vec![7]);
    assert_eq!(
        restored.get_number(0, "C1"),
        9.0,
        "SUBTOTAL 101-111 must still exclude the restored hidden rows"
    );
}

/// A workbook with nothing hidden serializes byte-identically to a
/// pre-E2 payload — the `skip_serializing_if` half of the backward
/// compatibility argument — and a payload with no `hidden` key restores
/// as "nothing hidden" rather than failing.
#[test]
fn wasm_persistence_v1_hidden_field_is_backward_compatible_both_ways() {
    let source = workbook_with_hidden_rows();
    let envelope = source.snapshot_persistence_v1_json();
    assert!(envelope.hidden.is_empty());
    let json = serde_json::to_string(&envelope).expect("serialize");
    assert!(
        !json.contains("\"hidden\""),
        "an unhidden workbook must not emit the key: {json}"
    );

    // A payload that predates the field (no `hidden` key at all).
    let legacy: WorkbookPersistenceV1JSON =
        serde_json::from_str(&json).expect("deserialize legacy");
    let mut restored = WasmWorkbook::new();
    let stats = restored
        .restore_persistence_v1_json(legacy)
        .expect("restore");
    assert_eq!(stats.restored_hidden_sheets, 0);
    assert!(restored.list_hidden_rows(0).is_empty());
}

/// The `snapshotHidden` / `restoreHidden` undo envelope round-trips, and
/// an empty one CLEARS rather than no-ops (REPLACE semantics).
#[test]
fn wasm_hidden_snapshot_restore_round_trip() {
    let mut wb = workbook_with_hidden_rows();
    assert!(wb.hide_rows(0, vec![1]));
    assert_eq!(wb.get_number(0, "C1"), 13.0);

    let before = HiddenRowsSnapshotJSON {
        version: 1,
        hidden: wb.hidden_rows_json(),
    };

    assert!(wb.hide_rows(0, vec![3]));
    assert_eq!(wb.get_number(0, "C1"), 9.0);

    assert_eq!(wb.restore_hidden_json(before), Ok(1));
    assert_eq!(wb.list_hidden_rows(0), vec![1]);
    assert_eq!(wb.get_number(0, "C1"), 13.0);

    let empty = HiddenRowsSnapshotJSON {
        version: 1,
        hidden: vec![],
    };
    assert_eq!(wb.restore_hidden_json(empty), Ok(0));
    assert!(wb.list_hidden_rows(0).is_empty());
    assert_eq!(wb.get_number(0, "C1"), 15.0);
}

/// A future envelope version is rejected loudly, mirroring
/// `restoreTables`.
#[test]
fn wasm_hidden_restore_rejects_unsupported_version_without_mutating() {
    let mut wb = workbook_with_hidden_rows();
    assert!(wb.hide_rows(0, vec![1]));
    let bad = HiddenRowsSnapshotJSON {
        version: 2,
        hidden: vec![],
    };
    assert_eq!(
        wb.restore_hidden_json(bad),
        Err("unsupported-snapshot-version".into())
    );
    assert_eq!(wb.list_hidden_rows(0), vec![1], "rejected without mutating");
}

/// The wasm hide/unhide/list surface reports change and degrades quietly
/// on an out-of-range sheet.
#[test]
fn wasm_hide_unhide_list_surface() {
    let mut wb = workbook_with_hidden_rows();
    assert!(wb.hide_rows(0, vec![3, 1]));
    assert_eq!(wb.list_hidden_rows(0), vec![1, 3]);
    assert!(!wb.hide_rows(0, vec![1]), "already hidden");
    assert!(wb.unhide_rows(0, vec![1]));
    assert_eq!(wb.list_hidden_rows(0), vec![3]);
    assert!(!wb.unhide_rows(0, vec![1]), "not hidden");

    assert!(!wb.hide_rows(99, vec![0]));
    assert!(!wb.unhide_rows(99, vec![0]));
    assert!(wb.list_hidden_rows(99).is_empty());
}
