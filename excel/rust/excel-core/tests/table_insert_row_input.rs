//! 空表首次输入、计算列继承与 insert_row 变化必须是同一条原生历史。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}

fn seed(template: Option<&str>) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let entry = TableEntry::from_parts("Orders", "Sheet1", range("A3", "B3"),
        false, false, vec!["Qty".into(), "Amount".into()]).with_insert_row(true)
        .with_calculated_columns(vec![None, template.map(|source|
            TableColumnFormula::new(2, source).unwrap())]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![entry])).unwrap();
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=ROWS(Orders[Qty])");
    book.set_formula(1, "A2", "=SUM(Orders[Amount])");
    (book, WorkbookHistory::default())
}

#[test]
fn first_value_and_inherited_formula_are_one_repeatable_history_entry() {
    let (mut book, mut history) = seed(Some("=A3*2"));
    let before = book.snapshot_tables();
    history.set_cell_input(&mut book, 0, "A3", "7").unwrap();
    for _ in 0..2 {
        assert_eq!(history.undo_count(), 1);
        assert!(!book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(14.));
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(14.));
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
        assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
        history.redo(&mut book).unwrap();
    }
    history.set_cell_input(&mut book, 0, "A4", "8").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(16.));
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(2.));
}

#[test]
fn first_formula_becomes_a_calculated_column_and_continues_into_the_next_row() {
    let (mut book, mut history) = seed(None);
    history.set_cell_input(&mut book, 0, "B3", "=A3*2").unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert!(book.get_table("Orders").unwrap().calculated_columns()[1].is_some());
    history.set_cell_input(&mut book, 0, "A3", "6").unwrap();
    history.set_cell_input(&mut book, 0, "A4", "5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(12.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(10.));
    for _ in 0..3 { history.undo(&mut book).unwrap(); }
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert!(book.get_table("Orders").unwrap().calculated_columns()[1].is_none());
    for _ in 0..3 { history.redo(&mut book).unwrap(); }
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(10.));
}

fn restrict(book: &mut Workbook, address: &str, min: f64, max: f64) {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    book.sheet_mut(0).unwrap().set_data_validation(range(address, address),
        Some(DataValidationRule { kind: DataValidationKind::WholeNumber { min, max },
            ignore_blank: false, operator: Default::default() })).unwrap();
}

#[test]
fn first_formula_is_validated_after_other_columns_have_been_inherited() {
    let (mut book, mut history) = seed(Some("=2"));
    restrict(&mut book, "A3", 3., 3.);
    history.set_cell_input(&mut book, 0, "A3", "=B3+1").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(2.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
}

#[test]
fn validation_failure_rolls_back_the_whole_first_row_and_preserves_redo() {
    let (mut book, mut history) = seed(Some("=A3*2"));
    restrict(&mut book, "B3", 0., 5.);
    history.set_cell_input(&mut book, 0, "F1", "9").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    assert!(history.set_cell_input(&mut book, 0, "A3", "7").is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn disabled_auto_expansion_still_creates_the_record_but_does_not_fill_other_columns() {
    let (mut book, mut history) = seed(Some("=A3*2"));
    let before = book.snapshot_tables();
    history.set_cell_input_with_table_expansion(&mut book, 0, "A3", "7", false).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
}

#[test]
fn clearing_an_unused_input_position_is_noop_but_an_empty_result_formula_is_a_record() {
    let (mut book, mut history) = seed(None);
    history.set_cell_input(&mut book, 0, "A3", "").unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(history.undo_count(), 0);
    history.set_cell_input(&mut book, 0, "A3", "=\"\"").unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
    history.set_cell_input(&mut book, 0, "A3", "").unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
}

#[test]
fn first_array_formula_is_rejected_even_when_its_projection_is_blocked() {
    for inherit in [false, true] {
        for blocked in [false, true] {
            let (mut book, mut history) = seed(None);
            if blocked { book.set_cell(0, "A4", Value::Number(99.)); }
            let before = book.snapshot_tables();
            assert!(history.set_cell_input_with_table_expansion(
                &mut book, 0, "A3", "=SEQUENCE(2,2)", inherit).is_err());
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
            assert_eq!(history.undo_count(), 0);
        }
    }
}

#[test]
fn first_input_targets_only_the_reserved_row_between_optional_headers_and_totals() {
    for headers in [false, true] {
        for totals in [false, true] {
            let mut book = Workbook::new();
            let row = 2 + u32::from(headers);
            let table = TableEntry::from_parts("Orders", "Sheet1", CellRange::new(
                CellAddress::new(2, 0), CellAddress::new(row + u32::from(totals), 1)),
                headers, totals, vec!["Qty".into(), "Amount".into()]).with_insert_row(true);
            book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
            if headers { book.set_cell(0, "A3", Value::Text("Qty".into())); }
            if totals {
                book.set_formula(0, &format!("B{}", row + 2), "=SUM(Orders[Amount])");
            }
            let before = book.snapshot_tables();
            let mut history = WorkbookHistory::default();
            history.set_cell_input(&mut book, 0, &format!("B{}", row + 1), "7").unwrap();
            assert!(!book.get_table("Orders").unwrap().has_insert_row());
            if headers { assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Qty".into())); }
            if totals { assert_eq!(book.get_cell("Sheet1", &format!("B{}", row + 2)), Value::Number(7.)); }
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), before);
        }
    }
}

#[test]
fn subscribers_observe_one_final_record_and_no_failed_intermediate_record() {
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut history) = seed(Some("=A3*2"));
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    book.sheet_mut(1).unwrap().subscribe_cell("A2", move || observed.set(observed.get() + 1));
    calls.set(0);
    restrict(&mut book, "B3", 0., 5.);
    assert!(history.set_cell_input(&mut book, 0, "A3", "7").is_err());
    assert_eq!(calls.replace(0), 0);
    history.set_cell_input(&mut book, 0, "A3", "2").unwrap();
    assert_eq!(calls.replace(0), 1);
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(4.));
    history.undo(&mut book).unwrap();
    assert_eq!(calls.replace(0), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(calls.get(), 1);
}
