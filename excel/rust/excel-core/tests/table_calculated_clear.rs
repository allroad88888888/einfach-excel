//! 清空计算列后重新输入：全空可重新建列，局部空洞仍是手工例外。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Total".into()));
    for (address, value) in [("A2", 10.), ("A3", 20.), ("A4", 30.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*2").unwrap();
    (book, history)
}

fn values(book: &Workbook) -> Vec<Value> {
    ["B2", "B3", "B4"].map(|address| book.get_cell("Sheet1", address)).to_vec()
}

#[test]
fn fully_cleared_column_can_reestablish_its_formula_with_one_undo() {
    for through_input in [false, true] {
        let (mut book, mut history) = seed();
        if through_input {
            for address in ["B2", "B3", "B4"] {
                history.set_cell_input(&mut book, 0, address, "").unwrap();
            }
        } else {
            book.clear_range(0, range("B2", "B4"));
        }
        let before = book.snapshot_tables();
        history.clear("");
        history.set_cell_input(&mut book, 0, "B3", "=[@Amount]*3").unwrap();
        assert_eq!(values(&book), vec![Value::Number(30.), Value::Number(60.), Value::Number(90.)]);
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(values(&book), vec![Value::Null; 3]);
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(values(&book), vec![Value::Number(30.), Value::Number(60.), Value::Number(90.)]);
        history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(120.));
    }
}

#[test]
fn partially_cleared_column_preserves_the_hole_and_other_rows() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B3", "").unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*3").unwrap();
    assert_eq!(values(&book), vec![Value::Number(30.), Value::Null, Value::Number(60.)]);
    assert_eq!(book.snapshot_tables(), before);
    history.undo(&mut book).unwrap();
    assert_eq!(values(&book), vec![Value::Number(20.), Value::Null, Value::Number(60.)]);
    history.redo(&mut book).unwrap();
    assert_eq!(values(&book), vec![Value::Number(30.), Value::Null, Value::Number(60.)]);
}

#[test]
fn single_cell_fallback_still_rejects_arrays_without_filling_an_exception() {
    for expand in [true, false] {
        for source in ["=SEQUENCE(2)", "=SEQUENCE(1,2)"] {
            let (mut book, mut history) = seed();
            history.set_cell_input(&mut book, 0, "B3", "").unwrap();
            book.set_cell(0, "C2", Value::Number(99.));
            let before = book.snapshot_tables();
            let before_values = values(&book);
            history.clear("");
            let report = book.add_sheet("Report");
            book.set_formula(report, "A1", "=SUM(Orders[Total])");
            let notifications = Rc::new(Cell::new(0));
            for (sheet, address) in [(0, "B2"), (report, "A1")] {
                let calls = notifications.clone();
                book.sheet_mut(sheet).unwrap().subscribe_cell(address,
                    move || calls.set(calls.get() + 1));
            }
            notifications.set(0);
            assert!(history.set_cell_input_with_table_expansion(
                &mut book, 0, "B2", source, expand).is_err());
            assert_eq!(values(&book), before_values);
            assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(99.));
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(history.undo_count(), 0);
            assert_eq!(notifications.get(), 0, "rejected input must not publish transient values");
        }
    }
}
