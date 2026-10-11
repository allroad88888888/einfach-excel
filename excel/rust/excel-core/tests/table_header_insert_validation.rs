//! 表头腾位按列带搬验证矩形，不扫描空白格，不重新验证已有值。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule, MAX_VALIDATION_REGIONS};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn rule() -> DataValidationRule {
    DataValidationRule { kind: DataValidationKind::List { items: vec!["Ready".into(), "On hold".into()] },
        ignore_blank: false, operator: Default::default() }
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("B3", "C4"), false, false, vec!["Qty".into(), "Amount".into()],
    )])).unwrap();
    book.set_cell(0, "B2", Value::Text("Keep outside".into()));
    book.set_cell(0, "B3", Value::Text("Already invalid".into()));
    (book, WorkbookHistory::default())
}
fn install(book: &mut Workbook, first: &str, last: &str) {
    book.sheet_mut(0).unwrap().set_data_validation(range(first, last), Some(rule())).unwrap();
}

#[test]
fn partial_columns_split_without_changing_neighbors_and_history_restores_exact_regions() {
    let (mut book, mut history) = seed();
    install(&mut book, "A3", "D5");
    install(&mut book, "F3", "F5");
    install(&mut book, "A1", "D1");
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    let after = book.sheet(0).unwrap().data_validations().to_vec();
    assert_eq!(after.iter().map(|entry| entry.range).collect::<Vec<_>>(), vec![
        range("A3", "A5"), range("B4", "C6"), range("D3", "D5"),
        range("F3", "F5"), range("A1", "D1"),
    ]);
    for region in &after[..3] { assert!(std::sync::Arc::ptr_eq(&region.rule, &before[0].rule)); }
    for _ in 0..2 {
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Text("Already invalid".into()));
        assert_eq!(book.sheet(0).unwrap().data_validation_at(CellAddress::parse("B3").unwrap()), None);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().data_validations(), before);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Already invalid".into()));
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().data_validations(), after);
    }
    assert_eq!(book.set_cell_input(0, "B4", "Wrong"), Err("DATA_VALIDATION_FAILED"));
    book.set_cell_input(0, "B4", "Ready").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Text("Ready".into()));
}

#[test]
fn insertion_inside_validation_extends_only_the_band_and_full_columns_stay_fixed() {
    let (mut book, mut history) = seed();
    install(&mut book, "A1", "D6");
    install(&mut book, "C1", "C1048576");
    book.add_sheet("Other");
    book.sheet_mut(1).unwrap().set_data_validation(range("B3", "C4"), Some(rule())).unwrap();
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    let other = book.sheet(1).unwrap().data_validations().to_vec();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    let sheet = book.sheet(0).unwrap();
    for address in ["B1", "B3", "B7", "C1", "C1048576"] {
        assert_eq!(sheet.data_validation_at(CellAddress::parse(address).unwrap()), Some(&rule()), "{address}");
    }
    for address in ["A7", "D7", "B8"] {
        assert_eq!(sheet.data_validation_at(CellAddress::parse(address).unwrap()), None, "{address}");
    }
    assert_eq!(book.sheet(1).unwrap().data_validations(), other);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
}

#[test]
fn unrelated_edits_survive_but_changed_regions_or_new_overlap_reject_before_writes() {
    let (mut book, mut history) = seed();
    install(&mut book, "B3", "C5");
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    install(&mut book, "F8", "F9");
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().data_validation_at(CellAddress::parse("F9").unwrap()), Some(&rule()));
    history.redo(&mut book).unwrap();
    // B3 是新表头，原来没有规则；外部新增规则不能被 undo 静默覆盖。
    install(&mut book, "B3", "B3");
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    assert!(history.undo(&mut book).unwrap_err().contains("validation changed"));
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
    assert!(book.get_table("Orders").unwrap().has_headers());
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Qty".into()));
    book.sheet_mut(0).unwrap().set_data_validation(range("B3", "B3"), None).unwrap();
    book.sheet_mut(0).unwrap().set_data_validation(range("B4", "B4"), None).unwrap();
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    assert!(history.undo(&mut book).unwrap_err().contains("validation changed"));
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn metadata_overflow_and_split_capacity_reject_atomically_and_keep_redo() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
    history.undo(&mut book).unwrap();
    install(&mut book, "A99", "D100");
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    assert!(history.set_table_headers(&mut book, "Orders", true, 100)
        .unwrap_err().contains("validation outside"));
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
    book.sheet_mut(0).unwrap().set_data_validation(range("A99", "D100"), None).unwrap();
    install(&mut book, "A3", "D5");
    for row in 0..MAX_VALIDATION_REGIONS - 1 {
        let cell = CellRange::single(CellAddress::new(row as u32, 8));
        book.sheet_mut(0).unwrap().set_data_validation(cell, Some(rule())).unwrap();
    }
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    assert!(history.set_table_headers(&mut book, "Orders", true, 100)
        .unwrap_err().contains("Too many data-validation regions"));
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
    assert!(!book.get_table("Orders").unwrap().has_headers());
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Already invalid".into()));
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 1);
}
