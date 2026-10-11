//! 右侧输入公式：扩列、表头、计算列源码与整列值必须是同一次可撤销输入。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Item".into()));
    book.set_cell(0, "B1", Value::Text("Amount".into()));
    for (addr, value) in [("B2", 10.), ("B3", 20.), ("B4", 30.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    (book, WorkbookHistory::default())
}
fn observe(book: &mut Workbook) -> Rc<Cell<u32>> {
    let report = book.add_sheet("Report");
    book.set_formula(report, "A1", "=Orders[#All]");
    book.set_formula(report, "E1", "=SUM(A1#)");
    let calls = Rc::new(Cell::new(0));
    let counter = calls.clone();
    book.sheet_mut(report).unwrap().subscribe_cell("E1", move || counter.set(counter.get() + 1));
    calls.set(0);
    calls
}

#[test]
fn right_input_fills_up_and_down_and_records_one_history_with_one_final_notification() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    let calls = observe(&mut book);
    history.set_cell_input(&mut book, 0, "C3", "=[@Amount]*2").unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "C4"));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("Column1".into()));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(20.));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(60.));
    assert_eq!(book.get_cell("Report", "E1"), Value::Number(180.));
    assert_eq!(calls.replace(0), 1);
    let after = book.snapshot_tables();
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "C1"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "C4"), Value::Null);
        assert_eq!(book.get_cell("Report", "C4"), Value::Null);
        assert_eq!(book.get_cell("Report", "E1"), Value::Number(60.));
        assert_eq!(calls.replace(0), 1);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), after);
        assert_eq!(book.get_cell("Report", "E1"), Value::Number(180.));
        assert_eq!(calls.replace(0), 1);
    }
}

#[test]
fn invalid_last_row_restores_geometry_header_and_column_without_losing_redo_or_notifying() {
    let (mut book, mut history) = seed();
    let calls = observe(&mut book);
    book.sheet_mut(0).unwrap().set_data_validation(range("C4", "C4"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 0., max: 50. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    calls.set(0);
    assert_eq!(history.set_cell_input(&mut book, 0, "C3", "=[@Amount]*2").unwrap_err(),
        "DATA_VALIDATION_FAILED");
    assert_eq!(book.snapshot_tables(), before);
    for addr in ["C1", "C2", "C3", "C4"] { assert_eq!(book.get_cell("Sheet1", addr), Value::Null); }
    assert_eq!(book.get_cell("Report", "E1"), Value::Number(60.));
    assert_eq!(history.redo_count(), 1);
    assert_eq!(calls.get(), 0);
}

#[test]
fn cycle_and_spill_rejection_leave_no_partial_expanded_table() {
    for source in ["=C3", "=SUM(", "=SEQUENCE(2)", "=SEQUENCE(1,2)"] {
        let (mut book, mut history) = seed();
        book.set_cell(0, "D2", Value::Number(99.));
        let before = book.snapshot_tables();
        assert!(history.set_cell_input(&mut book, 0, "C3", source).is_err(), "{source}");
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(history.undo_count(), 0);
        for addr in ["C1", "C2", "C3", "C4"] { assert_eq!(book.get_cell("Sheet1", addr), Value::Null); }
        assert_eq!(book.get_cell("Sheet1", "D2"), Value::Number(99.));
    }
}

#[test]
fn existing_other_data_prevents_autofill_but_current_cell_can_be_replaced() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "C2", Value::Number(99.));
    history.set_cell_input(&mut book, 0, "C3", "=B3*2").unwrap();
    assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(40.));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Null);
    let (mut book, mut history) = seed();
    book.set_cell(0, "C3", Value::Number(99.));
    history.set_cell_input(&mut book, 0, "C3", "=B3*2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(60.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Null);
}

#[test]
fn totals_row_is_excluded_and_the_new_template_survives_further_growth() {
    let (mut book, mut history) = seed();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    history.set_cell_input(&mut book, 0, "C3", "=[@Amount]*2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(60.));
    assert_eq!(book.get_cell("Sheet1", "C5"), Value::Null);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_table_totals_row(&mut book, "Orders", false).unwrap();
    history.set_cell_input(&mut book, 0, "B5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C5"), Value::Number(80.));
}

#[test]
fn text_format_literal_and_protection_policy_do_not_trigger_calculated_column_fill() {
    for input in ["'=B3*2", "42"] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "C3", input).unwrap();
        assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
        assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    }
    let (mut book, mut history) = seed();
    book.sheet_mut(0).unwrap().patch_format_range(range("C3", "C3"), StyleScope::Cell,
        CellStyle { number_format: Some(NumberFormat::Text), ..Default::default() });
    history.set_cell_input(&mut book, 0, "C3", "=B3*2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Text("=B3*2".into()));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    history.set_cell_input_with_table_expansion(&mut book, 0, "C3", "=B3*2", false).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(40.));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
}

#[test]
fn enormous_new_column_rejects_before_header_or_geometry_is_written() {
    let mut book = Workbook::new();
    book.define_table(Some("Orders"), 0, range("A1", "B1048576"), true).unwrap();
    let before = book.snapshot_tables();
    let mut history = WorkbookHistory::default();
    assert!(history.set_cell_input(&mut book, 0, "C3", "=1").unwrap_err().contains("32 MiB"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
    assert_eq!(history.undo_count(), 0);
}
