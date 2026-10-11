//! 空表范围变化必须保持合法定义，计算列及输入共用原 Table 历史。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableEntry, TableRegistrySnapshot, Workbook};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed(totals: bool) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A3", Value::Text("Qty".into()));
    book.set_cell(0, "B3", Value::Text("Amount".into()));
    if totals { book.set_cell(0, "B5", Value::Number(99.)); }
    let table = TableEntry::from_parts("Orders", "Sheet1", range("A3", if totals { "B5" } else { "B4" }),
        true, totals, vec!["Qty".into(), "Amount".into()]).with_insert_row(true)
        .with_calculated_columns(vec![None, Some(TableColumnFormula::new(3, "=A4*2").unwrap())]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=ROWS(Orders[Qty])");
    (book, WorkbookHistory::default())
}
fn assert_restorable(book: &Workbook) {
    let mut restored = Workbook::new();
    restored.restore_tables(book.snapshot_tables()).unwrap();
    assert_eq!(restored.snapshot_tables(), book.snapshot_tables());
}

#[test]
fn width_only_empty_resize_preserves_the_input_row_without_filling_templates() {
    for totals in [false, true] {
        let (mut book, mut history) = seed(totals);
        let before = book.snapshot_tables();
        history.resize_table(&mut book, "Orders", range("A3", if totals { "C5" } else { "C4" })).unwrap();
        assert!(book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_restorable(&book);
    }
}

#[test]
fn widening_into_existing_content_creates_one_record_and_inherits_its_formula() {
    let (mut book, mut history) = seed(false);
    book.set_cell(0, "C4", Value::Number(7.));
    let before = book.snapshot_tables();
    history.resize_table(&mut book, "Orders", range("A3", "C4")).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.));
    assert_restorable(&book);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(7.));
    history.redo(&mut book).unwrap();
    assert_restorable(&book);
}

#[test]
fn growing_down_inherits_all_new_records_including_the_former_input_position() {
    for totals in [false, true] {
        let (mut book, mut history) = seed(totals);
        book.set_cell(0, "A6", Value::Number(7.));
        let before = book.snapshot_tables();
        history.resize_table(&mut book, "Orders", range("A3", if totals { "B7" } else { "B6" })).unwrap();
        assert!(!book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(3.));
        for (addr, value) in [("B4", 0.), ("B5", 0.), ("B6", 14.)] {
            assert_eq!(book.get_cell("Sheet1", addr), Value::Number(value));
        }
        if totals { assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(99.)); }
        assert_restorable(&book);
        for _ in 0..2 {
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
            assert_eq!(book.get_cell("Sheet1", "A6"), Value::Number(7.));
            history.redo(&mut book).unwrap();
            assert_restorable(&book);
        }
    }
}

#[test]
fn shrinking_to_headers_removes_the_placeholder_without_an_invalid_saved_definition() {
    let (mut book, mut history) = seed(false);
    let before = book.snapshot_tables();
    history.resize_table(&mut book, "Orders", range("A3", "B3")).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
    assert_restorable(&book);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
}

#[test]
fn adjacent_value_input_and_header_input_have_different_empty_table_semantics() {
    for (addr, input, record) in [("C4", "7", true), ("C4", "=A4+1", true), ("C3", "7", false)] {
        let (mut book, mut history) = seed(false);
        let before = book.snapshot_tables();
        history.set_cell_input(&mut book, 0, addr, input).unwrap();
        assert_eq!(book.get_table("Orders").unwrap().has_insert_row(), !record);
        assert_eq!(book.get_cell("Sheet1", "B4"), if record { Value::Number(0.) } else { Value::Null });
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", addr), Value::Null);
        history.redo(&mut book).unwrap();
        assert_restorable(&book);
    }
}

#[test]
fn input_below_the_placeholder_fills_both_rows_and_can_be_undone_once() {
    let (mut book, mut history) = seed(false);
    let before = book.snapshot_tables();
    history.set_cell_input(&mut book, 0, "A5", "7").unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(14.));
    assert_restorable(&book);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_restorable(&book);
}

#[test]
fn inherited_validation_failure_rolls_back_adjacent_formula_and_the_original_empty_row() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    for addr in ["A5", "C4"] {
        let (mut book, mut history) = seed(false);
        book.sheet_mut(0).unwrap().set_data_validation(range("B4", "B4"), Some(DataValidationRule {
            kind: DataValidationKind::WholeNumber { min: 1., max: 10. },
            ignore_blank: true, operator: Default::default(),
        })).unwrap();
        let before = book.snapshot_tables();
        assert!(history.set_cell_input(&mut book, 0, addr, "=7").is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", addr), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn adjacent_formula_validates_after_the_existing_column_is_inherited() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    let (mut book, mut history) = seed(false);
    let table = book.get_table("Orders").unwrap().clone().with_calculated_columns(vec![None,
        Some(TableColumnFormula::new(3, "=5").unwrap())]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
    book.sheet_mut(0).unwrap().set_data_validation(range("C4", "C4"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 6., max: 6. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    let before = book.snapshot_tables();
    history.set_cell_input(&mut book, 0, "C4", "=B4+1").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(5.));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(6.));
    assert!(book.get_table("Orders").unwrap().calculated_columns()[2].is_some());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(6.));
}

#[test]
fn adjacent_totals_input_does_not_create_a_data_record() {
    let (mut book, mut history) = seed(true);
    let before = book.snapshot_tables();
    history.set_cell_input(&mut book, 0, "C5", "=B5").unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Sheet1", "C5"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_restorable(&book);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "C5"), Value::Null);
}

#[test]
fn widening_cannot_absorb_an_active_or_blocked_array() {
    for blocked in [false, true] {
        let (mut book, mut history) = seed(false);
        if blocked { book.set_cell(0, "C5", Value::Number(99.)); }
        book.set_formula(0, "C4", "=SEQUENCE(2)");
        let before = book.snapshot_tables();
        let original = book.get_cell("Sheet1", "C4");
        assert!(history.resize_table(&mut book, "Orders", range("A3", "C4")).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "C4"), original);
        assert_eq!(history.undo_count(), 0);
    }
}
