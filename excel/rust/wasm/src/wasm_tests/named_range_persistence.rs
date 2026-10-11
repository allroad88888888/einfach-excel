// 命名范围随同一个 v1 文件保存，不把定义降级成求值时的值快照。
#[test]
fn named_ranges_v1_roundtrip_keeps_dynamic_references_and_spills() {
    let mut source = WasmWorkbook::new();
    source.add_sheet("Source");
    source.set_number(1, "A1", 10.0);
    source.set_number(1, "A2", 20.0);
    source
        .workbook
        .define_named_range(
            "销售额",
            1,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
        )
        .unwrap();
    source.set_formula(0, "A1", "=SUM(销售额)");
    source.set_formula(0, "C1", "=销售额");
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(
        json["namedRanges"],
        serde_json::json!([
            {"name":"销售额","target":{"sheet":1,"range":[0,0,1,0]}}
        ])
    );
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert_eq!(restored.get_number(0, "A1"), 30.0);
    assert_eq!(restored.get_number(0, "C2"), 20.0);
    restored.set_number(1, "A2", 40.0);
    assert_eq!(restored.get_number(0, "A1"), 50.0);
    assert_eq!(restored.get_number(0, "C2"), 40.0);
    restored.workbook.insert_rows(1, 0, 1);
    assert_eq!(
        restored
            .workbook
            .named_range("销售额")
            .unwrap()
            .unwrap()
            .1
            .start
            .row,
        1
    );
    assert_eq!(restored.get_number(0, "A1"), 50.0);
    assert_eq!(restored.history.undo_count(), 0);
}

#[test]
fn named_ranges_v1_keeps_broken_definitions_without_rebinding_new_sheets() {
    let mut source = WasmWorkbook::new();
    source.add_sheet("Gone");
    source
        .workbook
        .define_named_range("Sales", 1, CellRange::single(CellAddress::new(0, 0)))
        .unwrap();
    source.set_formula(0, "A1", "=SUM(Sales)");
    source.workbook.remove_sheet(1).unwrap();
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["namedRanges"][0]["target"], serde_json::Value::Null);
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    restored.add_sheet("Gone");
    restored.set_number(1, "A1", 99.0);
    assert_eq!(
        restored.workbook.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        restored.workbook.named_names().collect::<Vec<_>>(),
        vec!["Sales"]
    );
}

#[test]
fn named_ranges_v1_rejects_bad_definitions_without_losing_history_or_data() {
    use einfach_excel_core::workbook::NamedRangeAction;
    let mut book = WasmWorkbook::new();
    book.set_number(0, "A1", 42.0);
    book.history
        .change_named_range(
            &mut book.workbook,
            0,
            NamedRangeAction::Create {
                name: "Keep".into(),
                sheet: 0,
                range: CellRange::single(CellAddress::new(0, 0)),
            },
        )
        .unwrap();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    for names in [
        serde_json::json!([{"name":"bad name","target":null}]),
        serde_json::json!([{"name":"SUM","target":null}]),
        serde_json::json!([{"name":"Sales","target":{"sheet":99,"range":[0,0,1,0]}}]),
        serde_json::json!([{"name":"Sales","target":{"sheet":0,"range":[0,0,1048576,0]}}]),
        serde_json::json!([{"name":"Sales","target":null},{"name":"sales","target":null}]),
    ] {
        let mut invalid = before.clone();
        invalid["namedRanges"] = names;
        assert!(book
            .restore_persistence_v1_json(serde_json::from_value(invalid).unwrap())
            .is_err());
        assert_eq!(
            serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(),
            before
        );
        assert_eq!(book.history.undo_count(), 1);
    }
}

#[test]
fn named_ranges_v1_rejects_table_namespace_collision_atomically() {
    let mut book = workbook_with_inventory_table();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let mut invalid = before.clone();
    invalid["namedRanges"] = serde_json::json!([{"name":"Inventory","target":null}]);
    assert!(book
        .restore_persistence_v1_json(serde_json::from_value(invalid).unwrap())
        .is_err());
    assert_eq!(
        serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(),
        before
    );
}

#[test]
fn named_ranges_snapshot_is_lazy_and_legacy_v1_without_names_stays_valid() {
    let mut source = WasmWorkbook::new();
    source
        .workbook
        .define_named_range(
            "Sales",
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(99_999, 0)),
        )
        .unwrap();
    source.set_formula(0, "C1", "=SUM(Sales)");
    let count = source.debug_formula_eval_count(0);
    let atoms = source
        .workbook
        .sheet(0)
        .unwrap()
        .debug_materialized_cell_atom_count();
    let mut json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(source.debug_formula_eval_count(0), count);
    assert_eq!(
        source
            .workbook
            .sheet(0)
            .unwrap()
            .debug_materialized_cell_atom_count(),
        atoms
    );
    json.as_object_mut().unwrap().remove("namedRanges");
    source
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert!(source.workbook.named_names().next().is_none());
    assert_eq!(
        source.workbook.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    let empty = serde_json::to_value(WasmWorkbook::new().snapshot_persistence_v1_json()).unwrap();
    assert!(empty.get("namedRanges").is_none());
}
