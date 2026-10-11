//! 表头腾位中的相邻 Table 必须整体移动，不能只移动格值留下旧定义。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn table(name: &str, first: &str, last: &str, headers: bool, totals: bool) -> TableEntry {
    TableEntry::from_parts(name, "Sheet1", range(first, last), headers, totals,
        vec!["Qty".into(), "Amount".into()])
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        table("Orders", "A1", "B2", false, false),
        table("LowerOrders", "A3", "B6", true, true).with_calculated_columns(vec![None,
            Some(TableColumnFormula::new(3, "=A4*2").unwrap())]),
        table("Tail", "A7", "B8", false, false),
        table("Side", "D3", "E5", true, false),
    ])).unwrap();
    for (addr, value) in [("A1", 2.), ("A2", 3.), ("A4", 5.), ("A5", 6.),
        ("A7", 7.), ("A8", 8.), ("D4", 99.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.set_cell(0, "A3", Value::Text("Qty".into()));
    book.set_cell(0, "B3", Value::Text("Amount".into()));
    book.set_formula(0, "B4", "=A4*2");
    book.set_formula(0, "B5", "=A5*2");
    book.set_formula(0, "B6", "=SUBTOTAL(109,LowerOrders[Amount])");
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=LowerOrders[Amount]");
    book.set_formula(1, "D1", "=LowerOrders[#Headers]");
    book.set_formula(1, "G1", "=SUM(Tail[Qty])");
    (book, WorkbookHistory::default())
}

#[test]
fn adjacent_tables_templates_and_totals_move_in_one_repeatable_transaction() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    let side = book.get_table("Side").unwrap().clone();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B3"));
        assert_eq!(book.get_table("LowerOrders").unwrap().range(), range("A4", "B7"));
        assert_eq!(book.get_table("Tail").unwrap().range(), range("A8", "B9"));
        assert_eq!(book.get_table("Side"), Some(&side));
        assert_eq!(book.get_cell("Sheet1", "A4"), Value::Text("Qty".into()));
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(12.));
        assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(22.));
        assert_eq!(book.get_cell("Sheet1", "D4"), Value::Number(99.));
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(12.));
        assert_eq!(book.get_cell("Report", "E1"), Value::Text("Amount".into()));
        assert_eq!(book.get_cell("Report", "G1"), Value::Number(15.));
        let formula = book.get_table("LowerOrders").unwrap().calculated_columns()[1].as_ref().unwrap();
        assert_eq!(formula.row(), 4);
        assert_eq!(formula.formula_at(5).unwrap(), book.sheet(0).unwrap().get_formula("B6").unwrap());
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(22.));
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(12.));
        history.redo(&mut book).unwrap();
        assert_eq!(history.undo_count(), 1);
    }
    history.set_cell_input(&mut book, 0, "B5", "=A5*3").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(18.));
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(33.));
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(18.));
}

#[test]
fn unrelated_tables_survive_undo_but_removed_moved_tables_reject_before_writes() {
    let (mut book, mut history) = seed();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    book.rename_table("Side", "Adjacent").unwrap();
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Adjacent").is_some());
    history.redo(&mut book).unwrap();
    book.delete_table("LowerOrders").unwrap();
    book.delete_table("Tail").unwrap();
    let before = book.snapshot_tables();
    assert!(history.undo(&mut book).unwrap_err().contains("outside history"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("Qty".into()));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Text("Qty".into()));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn partial_table_and_metadata_only_overflow_reject_atomically_without_losing_redo() {
    for (first, last, message) in [("B5", "C6", "split another table"),
        ("A99", "B100", "another table outside")] {
        let mut book = Workbook::new();
        book.restore_tables(TableRegistrySnapshot::from_entries(vec![
            table("Orders", "A1", "B2", false, false), table("Other", first, last, true, false),
        ])).unwrap();
        book.set_cell(0, "A1", Value::Number(2.));
        let mut history = WorkbookHistory::default();
        history.set_cell_input(&mut book, 0, "D1", "9").unwrap();
        history.undo(&mut book).unwrap();
        let before = book.snapshot_tables();
        assert!(history.set_table_headers(&mut book, "Orders", true, 100).unwrap_err().contains(message));
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
    }
}
