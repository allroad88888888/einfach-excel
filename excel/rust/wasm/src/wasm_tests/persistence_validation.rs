#[test]
fn wasm_workbook_restore_persistence_v1_rejects_bad_size_without_mutating_workbook() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.rename_sheet(0, "Keep"));
    wb.set_number(0, "A1", 7.0);

    let payload = WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Loaded".into(),
        }],
        cells: vec![SparseCellJSON {
            sheet: 0,
            addr: "A1".into(),
            row: 0,
            col: 0,
            kind: "number".into(),
            value: Some(ImportValueJSON::Number(99.0)),
        }],
        formats: vec![],
        sizes: vec![ViewportSizeSnapshotJSON {
            sheet: Some(0),
            start_row: 0,
            start_col: 0,
            end_row: 2,
            end_col: 2,
            row_heights: vec![ViewportRowHeightJSON {
                row_index: 10,
                height_px: 40,
            }],
            col_widths: vec![],
        }],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    };

    assert!(wb.restore_persistence_v1_json(payload).is_err());
    assert_eq!(wb.sheet_name(0), "Keep");
    assert_eq!(wb.get_number(0, "A1"), 7.0);
}

#[test]
fn wasm_workbook_restore_persistence_v1_rejects_unsupported_version() {
    let mut wb = WasmWorkbook::new();
    let payload = WorkbookPersistenceV1JSON {
        version: 2,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Sheet1".into(),
        }],
        cells: vec![],
        formats: vec![],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    };
    assert!(wb.restore_persistence_v1_json(payload).is_err());
}

#[test]
fn wasm_workbook_restore_persistence_v1_accepts_default_sheet_name() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.rename_sheet(0, "Old"));

    let payload = WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Sheet1".into(),
        }],
        cells: vec![SparseCellJSON {
            sheet: 0,
            addr: "A1".into(),
            row: 0,
            col: 0,
            kind: "number".into(),
            value: Some(ImportValueJSON::Number(42.0)),
        }],
        formats: vec![],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    };

    let stats = wb.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(stats.restored_cells, 1);
    assert_eq!(wb.sheet_name(0), "Sheet1");
    assert_eq!(wb.get_number(0, "A1"), 42.0);
}

#[test]
fn wasm_workbook_restore_persistence_v1_rejects_bad_format_without_mutating_workbook() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.rename_sheet(0, "Keep"));
    wb.set_number(0, "A1", 7.0);

    let payload = WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Loaded".into(),
        }],
        cells: vec![SparseCellJSON {
            sheet: 0,
            addr: "A1".into(),
            row: 0,
            col: 0,
            kind: "number".into(),
            value: Some(ImportValueJSON::Number(99.0)),
        }],
        formats: vec![FormatRangeSnapshotJSON {
            sheet: Some(1),
            start_row: 0,
            start_col: 0,
            end_row: 0,
            end_col: 0,
            cell_formats: vec![],
            range_formats: vec![],
        }],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    };

    assert!(wb.restore_persistence_v1_json(payload).is_err());
    assert_eq!(wb.sheet_name(0), "Keep");
    assert_eq!(wb.get_number(0, "A1"), 7.0);
}

#[test]
fn wasm_workbook_restore_persistence_v1_resets_subscription_tokens() {
    let mut wb = WasmWorkbook::new();
    wb.next_token = 42;

    let payload = WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Loaded".into(),
        }],
        cells: vec![],
        formats: vec![],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    };

    let stats = wb.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(stats.sheets, 1);
    assert_eq!(wb.next_token, 0);
    assert!(wb.subscriptions.is_empty());
}

/// Build a persistence-v1 envelope with `n` number primitives in
/// column A and `n` formulas (`=A{row}+1`) in column B, all on one
/// sheet. Shared by the storage-primary restore pin + bench.
fn persistence_v1_workload(n: u32) -> WorkbookPersistenceV1JSON {
    let mut cells = Vec::with_capacity(2 * n as usize);
    for row in 0..n {
        cells.push(SparseCellJSON {
            sheet: 0,
            addr: CellAddress::new(row, 0).to_string(),
            row,
            col: 0,
            kind: "number".into(),
            value: Some(ImportValueJSON::Number(row as f64)),
        });
        cells.push(SparseCellJSON {
            sheet: 0,
            addr: CellAddress::new(row, 1).to_string(),
            row,
            col: 1,
            kind: "formula".into(),
            value: Some(ImportValueJSON::Text(format!("=A{}+1", row + 1))),
        });
    }
    WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Data".into(),
        }],
        cells,
        formats: vec![],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
    }
}

/// Audit B-1 (W2.3): `restore_persistence_v1` routes through the
/// storage-primary `install_workbook_bulk` — a 1k-formula restore
/// leaves the dep graph EMPTY (no eager parse, no eager dep
/// install) and evaluates nothing until first read.
#[test]
fn wasm_workbook_restore_persistence_v1_storage_primary_lazy() {
    let payload = persistence_v1_workload(1_000);

    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(stats.restored_cells, 2_000);
    assert_eq!(stats.sheets, 1);

    // Lazy contract: nothing parsed eagerly into the dep graph,
    // nothing evaluated.
    let sheet = restored.workbook.sheet(0).unwrap();
    assert_eq!(sheet.debug_point_dependency_key_count(), 0);
    assert_eq!(restored.debug_formula_eval_count(0), 0);

    // Values are correct on first read (hydrate-on-read).
    assert_eq!(restored.get_number(0, "A500"), 499.0);
    assert_eq!(restored.get_number(0, "B500"), 500.0);
    assert_eq!(restored.get_number(0, "B1000"), 1000.0);
    assert_eq!(restored.debug_formula_cache_state(0, "B1"), "dirty");
}
