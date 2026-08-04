/// **Counterexample.** Filter state must survive a persistence round
/// trip.
///
/// `restore_persistence_v1` builds a FRESH `Workbook`, so before the
/// engine owned the filter there was nothing on this side of the
/// boundary to serialize and every save/load silently un-filtered every
/// row. Fails on the unfixed engine with a WRONG SUBTOTAL — 15 instead
/// of 9 — not with an error.
#[test]
fn wasm_persistence_v1_round_trips_filter_state() {
    let mut source = workbook_with_filter();
    source
        .workbook
        .apply_filter(0, &[keep_list(&["3", "5"])])
        .expect("apply");
    assert_eq!(source.workbook.filter_hidden_rows(0), vec![1, 3]); // A2 = 2, A4 = 4
    assert_eq!(source.get_number(0, "C1"), 9.0); // 15 - 2 - 4

    let envelope = source.snapshot_persistence_v1_json();
    let filter_entries = envelope.filters.len();
    let mut restored = WasmWorkbook::new();
    let stats = restored
        .restore_persistence_v1_json(envelope)
        .expect("restore");
    // Product consequence first: the number a user reads.
    assert_eq!(
        restored.get_number(0, "C1"),
        9.0,
        "SUBTOTAL 1-11 must still exclude the restored filter-hidden rows"
    );
    assert_eq!(restored.workbook.filter_hidden_rows(0), vec![1, 3]);
    assert_eq!(
        restored.workbook.filter_rules(0),
        vec![keep_list(&["3", "5"])],
        "the rules come back too, so Reapply still has something to reapply"
    );
    assert_eq!(stats.restored_filter_sheets, 1);
    assert_eq!(
        restored.workbook.debug_filter_scan_count(0),
        0,
        "a restore installs the remembered answer; it must not re-run the predicate"
    );
    assert_eq!(filter_entries, 1, "one sheet carried a filter");
}

/// An unfiltered workbook serializes byte-identically to a pre-E3
/// payload, and a payload with no `filters` key restores as "no filter"
/// rather than failing.
#[test]
fn wasm_persistence_v1_filters_field_is_backward_compatible_both_ways() {
    let source = workbook_with_filter();
    let envelope = source.snapshot_persistence_v1_json();
    assert!(envelope.filters.is_empty());
    let json = serde_json::to_string(&envelope).expect("serialize");
    assert!(
        !json.contains("\"filters\""),
        "an unfiltered workbook must not emit the key: {json}"
    );

    let legacy: WorkbookPersistenceV1JSON =
        serde_json::from_str(&json).expect("deserialize legacy");
    let mut restored = WasmWorkbook::new();
    let stats = restored
        .restore_persistence_v1_json(legacy)
        .expect("restore");
    assert_eq!(stats.restored_filter_sheets, 0);
    assert!(restored.workbook.filter_rules(0).is_empty());
}

/// The `snapshotFilters` / `restoreFilters` undo envelope round-trips,
/// and an empty one CLEARS rather than no-ops (REPLACE semantics).
#[test]
fn wasm_filter_snapshot_restore_round_trip() {
    let mut wb = workbook_with_filter();
    wb.workbook
        .apply_filter(0, &[keep_list(&["3", "5"])])
        .expect("apply");
    assert_eq!(wb.get_number(0, "C1"), 9.0);

    let before = FilterSnapshotJSON {
        version: 1,
        filters: wb.filters_json(),
    };

    wb.workbook
        .apply_filter(0, &[keep_list(&["5"])])
        .expect("apply");
    // Only A5 matches; A1 stays visible as the header row.
    assert_eq!(wb.get_number(0, "C1"), 6.0); // 15 - 2 - 3 - 4

    assert_eq!(wb.restore_filters_json(before), Ok(1));
    assert_eq!(wb.workbook.filter_hidden_rows(0), vec![1, 3]);
    assert_eq!(wb.get_number(0, "C1"), 9.0);

    let empty = FilterSnapshotJSON {
        version: 1,
        filters: vec![],
    };
    assert_eq!(wb.restore_filters_json(empty), Ok(0));
    assert!(wb.workbook.filter_rules(0).is_empty());
    assert_eq!(wb.get_number(0, "C1"), 15.0);
}

/// A future envelope version is rejected loudly, mirroring
/// `restoreTables` / `restoreHidden`.
#[test]
fn wasm_filter_restore_rejects_unsupported_version_without_mutating() {
    let mut wb = workbook_with_filter();
    wb.workbook
        .apply_filter(0, &[keep_list(&["3"])])
        .expect("apply");
    let bad = FilterSnapshotJSON {
        version: 2,
        filters: vec![],
    };
    assert_eq!(
        wb.restore_filters_json(bad),
        Err("unsupported-snapshot-version".into())
    );
    assert_eq!(
        wb.workbook.filter_rules(0),
        vec![keep_list(&["3"])],
        "rejected without mutating"
    );
}
