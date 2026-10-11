//! 新增 Table 记录只移动本列带；汇总、引用和计算列属于同一次历史。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn seed(totals: bool) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Qty".into()));
    book.set_cell(0, "B1", Value::Text("Amount".into()));
    book.set_cell(0, "A2", Value::Number(3.));
    book.define_table(Some("Orders"), 0, range("A1", "B2"), true).unwrap();
    let mut setup = WorkbookHistory::default();
    setup.set_cell_input(&mut book, 0, "B2", "=[@Qty]*2").unwrap();
    if totals { book.set_table_totals_row("Orders", true).unwrap(); }
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=Orders[Amount]");
    (book, WorkbookHistory::default())
}

#[test]
fn append_moves_totals_and_neighbors_without_touching_side_columns() {
    for totals in [false, true] {
        let (mut book, mut history) = seed(totals);
        let next = if totals { "A4" } else { "A3" };
        let shifted = if totals { "A5" } else { "A4" };
        book.set_cell(0, next, Value::Number(99.));
        book.set_cell(0, "D3", Value::Number(77.));
        book.set_formula(1, "D1", &format!("=Sheet1!{next}"));
        let before = book.snapshot_tables();
        assert_eq!(history.append_table_row(&mut book, "Orders", 100).unwrap(), 2);
        for _ in 0..2 {
            assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", if totals { "B4" } else { "B3" }));
            assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
            assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(0.));
            assert_eq!(book.get_cell("Report", "A2"), Value::Number(0.));
            if totals { assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(6.)); }
            assert_eq!(book.get_cell("Sheet1", shifted), Value::Number(99.));
            assert_eq!(book.get_cell("Sheet1", "D3"), Value::Number(77.));
            assert_eq!(book.get_cell("Report", "D1"), Value::Number(99.));
            assert_eq!(history.undo_count(), 1);
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.get_cell("Sheet1", next), Value::Number(99.));
            assert_eq!(book.get_cell("Report", "A2"), Value::Null);
            history.redo(&mut book).unwrap();
        }
    }
}

#[test]
fn empty_input_position_becomes_one_record_without_changing_bounds() {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1", range("A1", "B1"), false, false,
            vec!["Qty".into(), "Amount".into()]).with_insert_row(true)
            .with_calculated_columns(vec![None, Some(TableColumnFormula::new(0, "=A1*2").unwrap())]),
    ])).unwrap();
    let before = book.snapshot_tables();
    let mut history = WorkbookHistory::default();
    assert_eq!(history.append_table_row(&mut book, "Orders", 1).unwrap(), 0);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(0.));
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B1"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
}

#[test]
fn rejected_append_keeps_values_geometry_and_redo() {
    let (mut book, mut history) = seed(true);
    history.set_cell_input(&mut book, 0, "G1", "42").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    assert!(history.append_table_row(&mut book, "Orders", 3).is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(6.));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
}

#[test]
fn inherited_validation_or_array_failure_restores_the_complete_transaction() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    use std::{cell::Cell, rc::Rc};
    for array in [false, true] {
        let (mut book, mut setup) = seed(false);
        if array {
            setup.set_cell_input(&mut book, 0, "B2", "=IF(ROW()=3,SEQUENCE(2),1)").unwrap();
        } else {
            book.sheet_mut(0).unwrap().set_data_validation(range("B2", "B3"), Some(DataValidationRule {
                kind: DataValidationKind::WholeNumber { min: 1., max: 10. },
                ignore_blank: false, operator: Default::default(),
            })).unwrap();
        }
        book.set_table_totals_row("Orders", true).unwrap();
        book.set_cell(0, "A4", Value::Number(99.));
        let before = book.snapshot_tables();
        let total = book.get_cell("Sheet1", "B3");
        let mut history = WorkbookHistory::default();
        history.set_cell_input(&mut book, 0, "G1", "42").unwrap();
        history.undo(&mut book).unwrap();
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        book.sheet_mut(1).unwrap().subscribe_cell("A1", move || observed.set(observed.get() + 1));
        calls.set(0);
        assert!(history.append_table_row(&mut book, "Orders", 100).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B3"), total);
        assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(99.));
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
        assert_eq!(calls.get(), 0);
    }
}

#[test]
fn following_table_moves_as_a_whole_and_remains_independently_editable() {
    let (mut book, mut history) = seed(true);
    book.set_cell(0, "A4", Value::Text("Item".into()));
    book.set_cell(0, "B4", Value::Text("Value".into()));
    book.set_cell(0, "A5", Value::Text("Next".into()));
    book.set_cell(0, "B5", Value::Number(12.));
    book.define_table(Some("NextOrders"), 0, range("A4", "B5"), true).unwrap();
    let original = book.snapshot_tables();
    history.append_table_row(&mut book, "Orders", 100).unwrap();
    assert_eq!(book.get_table("NextOrders").unwrap().range(), range("A5", "B6"));
    assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(12.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(12.));
}
