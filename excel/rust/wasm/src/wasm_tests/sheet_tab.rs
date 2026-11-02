#[test]
fn hidden_state_and_tab_color_round_trip_through_persistence() {
    let mut source = WasmWorkbook::new();
    source.add_sheet("Second");
    source.set_number(0, "A1", 7.0);
    assert!(source.set_sheet_hidden(1, true).ok().unwrap());
    assert!(source.set_sheet_tab_color(0, Some("#ff8800".into())).ok().unwrap());
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(saved["sheets"][1]["hidden"], true);
    assert_eq!(saved["sheets"][0]["tabColor"], "#FF8800");
    assert!(saved["sheets"][0].get("hidden").is_none(), "visible sheets add no field");

    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert!(restored.sheet_hidden(1));
    assert!(!restored.sheet_hidden(0));
    assert_eq!(restored.sheet_tab_color(0), "#FF8800");
    assert_eq!(restored.sheet_tab_color(1), "");
}

#[test]
fn legacy_payloads_without_tab_fields_restore_visible_and_uncolored() {
    let mut source = WasmWorkbook::new();
    source.add_sheet("Second");
    let mut saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    saved["sheets"][0].as_object_mut().unwrap().remove("tabColor");
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert!(!restored.sheet_hidden(0) && !restored.sheet_hidden(1));
}

#[test]
fn payload_hiding_every_sheet_is_rejected() {
    let mut source = WasmWorkbook::new();
    let mut saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    saved["sheets"][0]["hidden"] = true.into();
    assert!(source.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).is_err());
}

#[test]
fn duplicate_sheet_is_one_history_step_with_independent_content() {
    let mut wb = WasmWorkbook::new();
    wb.set_number(0, "A1", 3.0);
    wb.set_formula(0, "B1", "=A1*2");
    let index = wb.duplicate_sheet(0).ok().unwrap();
    assert_eq!(index, 1);
    assert_eq!(wb.sheet_name(1), "Sheet1 (2)");
    wb.set_number(1, "A1", 10.0);
    assert_eq!(wb.workbook_value(1, "B1"), Value::Number(20.0));
    assert_eq!(wb.workbook_value(0, "B1"), Value::Number(6.0));
}

#[test]
fn calculation_mode_round_trips_through_persistence_v1() {
    let mut source = WasmWorkbook::new();
    source.set_number(0, "A1", 10.0);
    source.set_formula(0, "B1", "=A1*2");
    assert_eq!(source.get_calculation_mode(), "automatic");
    let auto_saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert!(auto_saved.get("calculationMode").is_none());

    assert!(source.set_calculation_mode("manual").ok().unwrap());
    assert_eq!(source.get_calculation_mode(), "manual");
    let manual_saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(manual_saved["calculationMode"], "manual");

    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(manual_saved).unwrap())
        .unwrap();
    assert_eq!(restored.get_calculation_mode(), "manual");
    assert_eq!(restored.workbook_value(0, "B1"), Value::Number(20.0));
    restored.set_number(0, "A1", 50.0);
    assert_eq!(restored.workbook_value(0, "B1"), Value::Number(20.0));
    restored.recalculate(None).unwrap();
    assert_eq!(restored.workbook_value(0, "B1"), Value::Number(100.0));
}
