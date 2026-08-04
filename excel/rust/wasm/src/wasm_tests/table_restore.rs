#[test]
fn wasm_table_restore_of_an_empty_envelope_clears_the_registry() {
    let mut wb = workbook_with_inventory_table();
    let empty = TableRegistrySnapshotJSON {
        version: 1,
        tables: vec![],
    };
    assert_eq!(wb.restore_tables_json(empty), Ok(0));
    assert_eq!(wb.workbook.table_count(), 0);
}

#[test]
fn wasm_table_restore_rejects_unsupported_version_without_mutating() {
    let mut wb = workbook_with_inventory_table();
    let bad = TableRegistrySnapshotJSON {
        version: 2,
        tables: vec![],
    };
    assert_eq!(
        wb.restore_tables_json(bad),
        Err("unsupported-snapshot-version".into())
    );
    assert_eq!(wb.workbook.table_count(), 1, "registry untouched");
}

#[test]
fn wasm_table_restore_surfaces_engine_error_ids_and_parse_failures() {
    let mut wb = workbook_with_inventory_table();

    // Engine-side rejection keeps the stable `table_error_to_js` id.
    let malformed = TableRegistrySnapshotJSON {
        version: 1,
        tables: vec![TableJSON {
            name: "Broken".into(),
            sheet: "Sheet1".into(),
            sheet_index: 0,
            range: "A1:C4".into(),
            has_headers: true,
            has_totals: false,
            columns: vec!["only-one".into()],
        }],
    };
    assert_eq!(
        wb.restore_tables_json(malformed),
        Err("malformed-snapshot".into())
    );

    // Wire-side parse failure is reported before the engine is reached.
    let unparseable = TableRegistrySnapshotJSON {
        version: 1,
        tables: vec![TableJSON {
            name: "Broken".into(),
            sheet: "Sheet1".into(),
            sheet_index: 0,
            range: "not-a-cell".into(),
            has_headers: true,
            has_totals: false,
            columns: vec!["a".into()],
        }],
    };
    assert!(wb
        .restore_tables_json(unparseable)
        .unwrap_err()
        .contains("invalid table range cell"));

    assert_eq!(wb.workbook.table_count(), 1, "both rejections were inert");
}

#[test]
fn wasm_table_json_round_trips_through_into_entry() {
    let wb = workbook_with_inventory_table();
    let json = wb.tables_json().into_iter().next().expect("one table");
    let entry = json.into_entry().expect("parse");
    assert_eq!(entry.name(), "Inventory");
    assert_eq!(entry.sheet_name(), "Sheet1");
    assert_eq!(entry.range().start, CellAddress::new(0, 0));
    assert_eq!(entry.range().end, CellAddress::new(3, 2));
    assert!(entry.has_headers());
    assert_eq!(entry.columns(), ["Name", "Qty", "Price"]);
}

#[test]
fn wasm_persistence_v1_carries_the_table_registry_through_a_restore() {
    let source = workbook_with_inventory_table();
    let envelope = source.snapshot_persistence_v1_json();
    assert_eq!(envelope.tables.len(), 1, "registry rides along");
    assert_eq!(envelope.tables[0].name, "Inventory");

    // A FRESH workbook — this is the shape `restore_persistence_v1`
    // builds internally, and the case where a missing registry made the
    // restore lossy.
    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(envelope).unwrap();
    assert_eq!(stats.restored_tables, 1);

    let entry = restored.workbook.get_table("Inventory").expect("entry");
    assert_eq!(entry.sheet_name(), "Sheet1");
    assert_eq!(entry.columns(), ["Name", "Qty", "Price"]);

    // The decisive check: a structured reference resolves after restore.
    restored
        .workbook
        .set_formula(0, "E1", "=SUM(Inventory[Qty])");
    assert_eq!(
        restored.workbook.get_cell("Sheet1", "E1"),
        Value::Number(6.0)
    );
}

#[test]
fn wasm_persistence_v1_payload_without_tables_field_still_restores() {
    // Backward compatibility: payloads written before the field existed
    // deserialize with an empty registry rather than failing.
    let json = r#"{"version":1,"sheets":[{"idx":0,"name":"Sheet1"}],"cells":[]}"#;
    let payload: WorkbookPersistenceV1JSON =
        serde_json::from_str(json).expect("legacy payload parses");
    assert!(payload.tables.is_empty());

    let mut wb = workbook_with_inventory_table();
    let stats = wb.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(stats.restored_tables, 0);
    assert_eq!(
        wb.workbook.table_count(),
        0,
        "fresh workbook + empty registry"
    );
}

#[test]
fn wasm_persistence_v1_omits_the_tables_key_for_a_table_less_workbook() {
    let wb = WasmWorkbook::new();
    let envelope = wb.snapshot_persistence_v1_json();
    let json = serde_json::to_string(&envelope).expect("serialize");
    assert!(
        !json.contains("\"tables\""),
        "wire stays byte-identical for table-less workbooks: {json}"
    );
}
