#[test]
fn table_json_from_entry_maps_fields() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    let sd = wb.index_of("Data").unwrap();
    wb.set_cell(sd, "A1", Value::Text("Region".into()));
    wb.set_cell(sd, "B1", Value::Text("Sales".into()));
    wb.define_table(
        Some("Revenue"),
        sd,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 1)),
        true,
    )
    .expect("define table");

    // Case-insensitive lookup returns the canonical-cased entry.
    let entry = wb.get_table("revenue").expect("entry");
    let json = TableJSON::from_entry(entry, sd as u32);
    assert_eq!(json.name, "Revenue");
    assert_eq!(json.sheet, "Data");
    assert_eq!(json.sheet_index, sd as u32);
    assert_eq!(json.range, "A1:B3", "range emitted as an A1 span");
    assert!(json.has_headers);
    assert!(!json.has_totals);
    assert_eq!(
        json.columns,
        vec!["Region".to_string(), "Sales".to_string()],
        "column display names read from the header row"
    );
}

// === Table registry snapshot / restore wire (#32 §11/§12) ===

/// Build a `WasmWorkbook` holding one Table `Inventory` at A1:C4 on
/// Sheet1 (headers Name/Qty/Price + 3 data rows).
fn workbook_with_inventory_table() -> WasmWorkbook {
    let mut wb = WasmWorkbook::new();
    for (a1, v) in [("A1", "Name"), ("B1", "Qty"), ("C1", "Price")] {
        wb.workbook.set_cell(0, a1, Value::Text(v.into()));
    }
    for (i, qty) in [1.0f64, 2.0, 3.0].iter().enumerate() {
        let r = i + 2;
        wb.workbook
            .set_cell(0, &format!("B{r}"), Value::Number(*qty));
    }
    wb.workbook
        .define_table(
            Some("Inventory"),
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 2)),
            true,
        )
        .expect("define table");
    wb
}

fn snapshot_tables_json(wb: &WasmWorkbook) -> TableRegistrySnapshotJSON {
    TableRegistrySnapshotJSON {
        version: 1,
        tables: wb.tables_json(),
    }
}

#[test]
fn wasm_table_snapshot_restore_round_trips_the_registry() {
    let mut wb = workbook_with_inventory_table();
    let before = snapshot_tables_json(&wb);
    assert_eq!(before.version, 1);
    assert_eq!(before.tables.len(), 1);

    wb.workbook.delete_table("Inventory").expect("delete");
    wb.workbook
        .define_table(
            Some("Other"),
            0,
            CellRange::new(CellAddress::new(10, 0), CellAddress::new(11, 0)),
            true,
        )
        .expect("other");

    assert_eq!(wb.restore_tables_json(before), Ok(1));
    let entry = wb.workbook.get_table("Inventory").expect("revived");
    assert_eq!(entry.range().end.row, 3);
    assert_eq!(entry.columns(), ["Name", "Qty", "Price"]);
    assert!(
        wb.workbook.get_table("Other").is_none(),
        "REPLACE drops post-snapshot tables"
    );
}

#[test]
fn wasm_table_restore_preserves_totals_flag_and_grown_range() {
    let mut wb = workbook_with_inventory_table();
    wb.workbook
        .set_table_totals_row("Inventory", true)
        .expect("totals on");
    let with_totals = snapshot_tables_json(&wb);
    assert!(with_totals.tables[0].has_totals);
    assert_eq!(with_totals.tables[0].range, "A1:C5");

    wb.workbook
        .set_table_totals_row("Inventory", false)
        .expect("totals off");
    assert!(!wb.workbook.get_table("Inventory").unwrap().has_totals());

    assert_eq!(wb.restore_tables_json(with_totals), Ok(1));
    let entry = wb.workbook.get_table("Inventory").expect("entry");
    assert!(entry.has_totals(), "flag restored");
    assert_eq!(entry.range().end.row, 4, "grown range restored");
}
