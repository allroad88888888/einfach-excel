#[test]
fn date_period_wire_roundtrips_all_options_without_resolving_a_date() {
    for period in ["today", "yesterday", "tomorrow", "last-week", "this-week", "next-week",
        "last-month", "this-month", "next-month", "last-quarter", "this-quarter", "next-quarter",
        "last-year", "this-year", "next-year", "year-to-date"] {
        let json = serde_json::json!({"kind":"date-period","colIndex":1,"period":period});
        let parsed: ColumnFilterRuleJSON = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(ColumnFilterRuleJSON::from_rule(&parsed.into_rule())).unwrap(), json);
    }
}

#[test]
fn ordinary_and_table_date_snapshots_restore_without_rescanning() {
    let mut book = workbook_with_inventory_table();
    for (cell, formula) in [("B2", "=TODAY()"), ("B3", "=TODAY()+1"), ("B4", "=TODAY()-1"),
        ("D2", "=TODAY()+0.75"), ("D3", "=TODAY()-1")] {
        book.workbook.set_formula(0, cell, formula);
    }
    let rule: ColumnFilterRuleJSON = serde_json::from_value(serde_json::json!({
        "kind":"date-period","colIndex":1,"period":"today"})).unwrap();
    book.workbook.apply_table_filter("Inventory", &[rule.into_rule()]).unwrap();
    let ordinary: ColumnFilterRuleJSON = serde_json::from_value(serde_json::json!({
        "kind":"date-period","colIndex":3,"period":"today"})).unwrap();
    book.workbook.apply_filter_range(0,
        CellRange::new(CellAddress::new(0, 3), CellAddress::new(3, 3)),
        &[ordinary.into_rule()]).unwrap();
    book.workbook.hide_rows(0, &[8]);
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(before.clone()).unwrap()).unwrap();
    let after = serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap();
    for key in ["filters", "tables", "hidden"] { assert_eq!(after[key], before[key], "{key}"); }
    assert_eq!(after["tables"][0]["autoFilter"]["hiddenRows"], serde_json::json!([2, 3]));
    assert_eq!(after["filters"][0]["hiddenRows"], serde_json::json!([2, 3]));
    assert_eq!(restored.workbook.debug_filter_scan_count(0), 0);
    restored.workbook.set_formula(0, "B3", "=TODAY()");
    restored.workbook.reapply_table_filter("Inventory").unwrap();
    assert_eq!(restored.workbook.debug_filter_scan_count(0), 1);
}

#[test]
fn unknown_date_periods_and_invalid_native_columns_cannot_partially_restore() {
    let mut book = workbook_with_inventory_table();
    let saved = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    for period in [serde_json::json!("thisMonth"), serde_json::json!("quarter-1"),
        serde_json::json!(""), serde_json::json!(false), serde_json::json!(null)] {
        let rule = serde_json::json!({"kind":"date-period","colIndex":1,"period":period});
        assert!(serde_json::from_value::<ColumnFilterRuleJSON>(rule.clone()).is_err());
        for table in [false, true] {
            let mut invalid = saved.clone();
            if table { invalid["tables"][0]["autoFilter"] =
                serde_json::json!({"rules":[rule.clone()],"hiddenRows":[1]}); }
            else { invalid["filters"] = serde_json::json!([{"sheet":0,
                "rules":[rule.clone()],"hiddenRows":[1]}]); }
            assert!(serde_json::from_value::<WorkbookPersistenceV1JSON>(invalid).is_err());
            assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), saved);
        }
    }
    let invalid = ColumnFilterRuleJSON::DatePeriod { col_index: 16384,
        period: einfach_excel_core::filter::FilterDatePeriod::Today }.into_rule();
    assert!(book.workbook.apply_filter(0, &[invalid.clone()]).is_err());
    assert!(book.workbook.apply_table_filter("Inventory", &[invalid]).is_err());
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), saved);
}
