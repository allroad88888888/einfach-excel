//! 表头局部腾位时，命名区域与消费者共用同一个历史事务。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}

fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (address, value) in [("A1", 10.), ("A2", 20.), ("A3", 2.), ("A4", 3.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1", range("A3", "B4"), false, false,
            vec!["Qty".into(), "Total".into()]),
    ])).unwrap();
    book.add_sheet("Report");
    for (name, sheet, first, last) in [
        ("Body", 0, "A3", "A4"), ("Span", 0, "A1", "A4"),
        ("Wide", 0, "A1", "D4"), ("Whole", 0, "A1", "A1048576"),
        ("Above", 0, "A1", "A2"), ("Adjacent", 0, "D3", "D4"),
        ("OtherSheet", 1, "A3", "A4"),
    ] {
        book.define_named_range(name, sheet, range(first, last)).unwrap();
    }
    book.set_formula(1, "A1", "=Body");
    book.set_formula(1, "C1", "=SUM(Body)");
    book.set_formula(1, "E1", "=IF(ROWS(Span)>4,SEQUENCE(3),SEQUENCE(2))");
    (book, WorkbookHistory::default())
}

#[test]
fn names_follow_the_column_band_and_arrays_observe_only_the_final_transaction() {
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut history) = seed();
    let before = book.snapshot_named_ranges();
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(3.));
    assert_eq!(book.get_cell("Report", "E3"), Value::Null);
    let calls = Rc::new(Cell::new(0));
    let counter = calls.clone();
    book.sheet_mut(1).unwrap().subscribe_cell("C1", move || counter.set(counter.get() + 1));
    calls.set(0);
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(book.named_range("Body").unwrap().unwrap().1, range("A4", "A5"));
        assert_eq!(book.named_range("Span").unwrap().unwrap().1, range("A1", "A5"));
        for name in ["Wide", "Whole", "Above", "Adjacent", "OtherSheet"] {
            let old = before.iter().find(|entry| entry.name == name).unwrap();
            assert_eq!(book.named_range(name).unwrap().unwrap().1, old.target.unwrap().1);
        }
        // 先读子格；不能依靠后续读锚点补投影。
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(3.));
        assert_eq!(book.get_cell("Report", "E3"), Value::Number(3.));
        assert_eq!(book.get_cell("Report", "C1"), Value::Number(5.));
        assert!(calls.replace(0) <= 1, "subscriber saw an intermediate transaction state");
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_named_ranges(), before);
        assert_eq!(book.get_cell("Report", "E3"), Value::Null);
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(3.));
        assert!(calls.replace(0) <= 1);
        history.redo(&mut book).unwrap();
    }
    book.set_cell(0, "A5", Value::Number(8.));
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(8.));
    assert_eq!(book.get_cell("Report", "C1"), Value::Number(10.));
}

#[test]
fn unrelated_name_edits_survive_history_but_changed_moved_names_reject_it() {
    let (mut book, mut history) = seed();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    book.define_named_range("Adjacent", 0, range("D8", "D9")).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.named_range("Adjacent").unwrap().unwrap().1, range("D8", "D9"));
    history.redo(&mut book).unwrap();
    book.define_named_range("Body", 0, range("A8", "A9")).unwrap();
    let names = book.snapshot_named_ranges();
    let tables = book.snapshot_tables();
    assert!(history.undo(&mut book).unwrap_err().contains("named range"));
    assert_eq!(book.snapshot_named_ranges(), names);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Qty".into()));
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(3.));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn named_range_overflow_rejects_before_writes_and_preserves_redo() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "D10", "7").unwrap();
    history.undo(&mut book).unwrap();
    for last in ["A100", "A1048576"] {
        book.define_named_range("Bottom", 0, range("A4", last)).unwrap();
        let before = book.snapshot_named_ranges();
        let tables = book.snapshot_tables();
        assert!(history.set_table_headers(&mut book, "Orders", true, 100)
            .unwrap_err().contains("named range outside"));
        assert_eq!(book.snapshot_named_ranges(), before);
        assert_eq!(book.snapshot_tables(), tables);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
    }
}
