//! 计算列定义的坐标、序列化与原生目录契约；不是计算列交互完成的证明。
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableEntry,
    TableError, TableRegistrySnapshot, Workbook};

#[test]
fn formulas_translate_both_directions_without_moving_absolute_or_structured_refs() {
    let formula = TableColumnFormula::new(4, "=A5+$B$1+C$2+$D5").unwrap();
    assert_eq!(formula.formula_at(1).unwrap(), "=(((A2+$B$1)+C$2)+$D2)");
    assert_eq!(formula.formula_at(9).unwrap(), "=(((A10+$B$1)+C$2)+$D10)");
    let structured = TableColumnFormula::new(4, "=Orders[@Amount]*2").unwrap();
    assert_eq!(structured.formula_at(1).unwrap(), "=(Orders[@Amount]*2)");
    assert_eq!(structured.formula_at(9).unwrap(), "=(Orders[@Amount]*2)");
}

#[test]
fn invalid_sources_and_outside_origins_reject_while_shifted_refs_use_native_ref_error() {
    assert!(TableColumnFormula::new(0, "=SUM(").is_err());
    assert!(TableColumnFormula::new(0, "42").is_err());
    assert!(TableColumnFormula::new(1_048_576, "=1").is_err());
    let formula = TableColumnFormula::new(4, "=A1").unwrap();
    assert_eq!(formula.formula_at(3).unwrap(), "=#REF!");
    assert!(formula.formula_at(1_048_576).is_err());
}

#[test]
fn wire_keeps_only_source_and_origin_and_rejects_invalid_or_unknown_fields() {
    let formula = TableColumnFormula::new(4, "=A5*2").unwrap();
    let json = serde_json::to_value(&formula).unwrap();
    assert_eq!(json, serde_json::json!({"row":4,"formula":"=(A5*2)"}));
    assert_eq!(serde_json::from_value::<TableColumnFormula>(json).unwrap(), formula);
    for value in [
        serde_json::json!({"row":0,"formula":"=SUM("}),
        serde_json::json!({"row":-1,"formula":"=1"}),
        serde_json::json!({"row":1_048_576,"formula":"=1"}),
        serde_json::json!({"row":0,"formula":"=1","value":1}),
    ] { assert!(serde_json::from_value::<TableColumnFormula>(value).is_err()); }
}

#[test]
fn registry_preserves_definitions_and_rejects_misaligned_columns_atomically() {
    let mut book = Workbook::new();
    let table = TableEntry::from_parts("Orders", "Sheet1", CellRange::new(
        CellAddress::new(0, 0), CellAddress::new(3, 1)), true, false,
        vec!["Amount".into(), "Total".into()]);
    assert!(table.calculated_columns().is_empty());
    let formula = TableColumnFormula::new(1, "=A2*2").unwrap();
    let valid = table.clone().with_calculated_columns(vec![None, Some(formula.clone())]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![valid.clone()])).unwrap();
    assert_eq!(book.get_table("Orders"), Some(&valid));
    let before = book.snapshot_tables();
    let bad = table.with_calculated_columns(vec![Some(formula)]);
    assert_eq!(book.restore_tables(TableRegistrySnapshot::from_entries(vec![bad])),
        Err(TableError::MalformedSnapshot));
    assert_eq!(book.snapshot_tables(), before);
}
