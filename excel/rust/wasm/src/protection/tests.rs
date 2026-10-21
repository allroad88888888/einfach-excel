// Pure native helpers exercise the same persistence envelope shipped by WASM.
#[test]
fn protection_file_roundtrip_and_invalid_payload_are_atomic() {
    use einfach_excel_core::protection::{ProtectionChange, ProtectionRange};
    let mut source = WasmWorkbook::new();
    source.set_cell_number(0, "A1", 7.0);
    source.workbook.change_protection(0, ProtectionChange::AllowRange {
        range: ProtectionRange { row_start: 1, row_end: 1, col_start: 1, col_end: 1 },
    }).unwrap();
    source.workbook.change_protection(0, ProtectionChange::Protect).unwrap();
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(saved["protection"][0]["protection"]["mode"], "protected");
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved.clone()).unwrap()).unwrap();
    assert_eq!(restored.workbook.read_protection(0).unwrap(), source.workbook.read_protection(0).unwrap());
    assert_eq!(restored.workbook.get_cell("Sheet1", "A1"), Value::Number(7.0));
    restored.set_cell_number(0, "A1", 99.0);
    restored.set_cell_text(0, "A1", "blocked");
    assert_eq!(restored.workbook.get_cell("Sheet1", "A1"), Value::Number(7.0));
    let before = serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap();
    let mut invalid = saved.clone();
    invalid["protection"][0]["protection"]["unlockedRanges"][0]["rowEnd"] = 1_048_576.into();
    assert!(restored.restore_persistence_v1_json(serde_json::from_value(invalid).unwrap()).is_err());
    assert_eq!(serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap(), before);
    let mut duplicate = saved.clone();
    duplicate["protection"].as_array_mut().unwrap().push(saved["protection"][0].clone());
    assert!(restored.restore_persistence_v1_json(serde_json::from_value(duplicate).unwrap()).is_err());
    assert_eq!(serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap(), before);
}

#[test]
fn legacy_files_open_without_protection_and_settings_do_not_enter_history() {
    use einfach_excel_core::protection::{ProtectionChange, ProtectionMode};
    let mut book = WasmWorkbook::new();
    book.history.set_cell_input(&mut book.workbook, 0, "A1", "5").unwrap();
    book.workbook.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(book.history.undo_count(), 1);
    assert!(book.history.undo(&mut book.workbook).is_err());
    assert_eq!(book.history.undo_count(), 1);
    let mut old = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    old.as_object_mut().unwrap().remove("protection");
    book.restore_persistence_v1_json(serde_json::from_value(old).unwrap()).unwrap();
    assert_eq!(book.workbook.read_protection(0).unwrap().mode, ProtectionMode::Open);
    assert_eq!(book.history.undo_count(), 0);
    assert_eq!(book.workbook.get_cell("Sheet1", "A1"), Value::Number(5.0));
}
