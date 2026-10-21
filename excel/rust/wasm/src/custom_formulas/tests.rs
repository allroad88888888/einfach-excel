use super::*;

fn source() -> WasmWorkbook {
    let mut book = WasmWorkbook::new();
    book.change_custom_formula(0,
        r#"{"kind":"upsert","definition":{"name":"DOUBLE","parameters":["amount"],"expression":"=amount*2"}}"#)
        .unwrap();
    book.set_number(0, "A1", 7.0);
    book.set_text(0, "B1", "neighbor");
    book.set_formula(0, "C1", "=DOUBLE(A1)");
    book
}

#[test]
fn expression_native_file_roundtrip_restores_definitions_before_protection_and_formulas() {
    let mut source = source();
    source
        .workbook
        .change_protection(0, einfach_excel_core::protection::ProtectionChange::Protect)
        .unwrap();
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["customFormulas"][0]["name"], "DOUBLE");
    assert_eq!(
        json["customFormulas"][0]["parameters"],
        serde_json::json!(["AMOUNT"])
    );
    assert_eq!(json["customFormulas"][0]["expression"], "=amount*2");
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert_eq!(restored.get_display(0, "C1"), "14");
    assert_eq!(restored.get_display(0, "B1"), "neighbor");
    assert!(restored.workbook.ensure_workbook_unprotected().is_err());
    assert_eq!(
        restored.workbook.custom_formula_definitions(),
        source.workbook.custom_formula_definitions()
    );
}

#[test]
fn missing_file_field_is_legacy_empty_registry_and_formula_shows_true_name_error() {
    let mut json = serde_json::to_value(source().snapshot_persistence_v1_json()).unwrap();
    json.as_object_mut().unwrap().remove("customFormulas");
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert!(restored.workbook.custom_formula_definitions().is_empty());
    assert_eq!(restored.get_display(0, "C1"), "#NAME?");
    assert_eq!(restored.get_display(0, "A1"), "7");
}

#[test]
fn invalid_custom_file_rejects_duplicate_cycle_and_parameter_scope_atomically() {
    for definitions in [
        serde_json::json!([
            {"name":"DUPLICATE","parameters":[],"expression":"=1"},
            {"name":"DUPLICATE","parameters":[],"expression":"=2"}]),
        serde_json::json!([{"name":"LOOP","parameters":[],"expression":"=LOOP()"}]),
        serde_json::json!([{"name":"UNSAFE","parameters":[],"expression":"=INDIRECT(\"A1\")"}]),
    ] {
        let mut book = source();
        let mut json = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
        json["customFormulas"] = definitions;
        assert!(book
            .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
            .is_err());
        assert_eq!(book.get_display(0, "C1"), "14");
        assert_eq!(book.workbook.custom_formula_definitions()[0].name, "DOUBLE");
    }
    let unsafe_definition =
        serde_json::json!({"name":"UNSAFE","parameters":[],"expression":"=1","source":"alert(1)"});
    assert!(
        serde_json::from_value::<einfach_excel_core::custom_formulas::CustomFormulaDefinition>(
            unsafe_definition
        )
        .is_err()
    );
}
