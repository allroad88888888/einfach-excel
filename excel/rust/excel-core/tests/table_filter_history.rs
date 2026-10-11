//! Table 筛选复用原生历史：回放快照，不在撤销时重扫当前数据。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn rule() -> ColumnFilterRule {
    ColumnFilterRule::Range { col_index: 0, min: Some(2.), max: None }
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (addr, value) in [("A2", 1.), ("A3", 2.), ("A4", 3.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    book.set_formula(0, "D1", "=SUBTOTAL(9,A2:A4)");
    (book, WorkbookHistory::default())
}

#[test]
fn apply_clear_and_reapply_replay_exact_snapshots_without_rescanning() {
    let (mut book, mut history) = seed();
    history.apply_table_filter(&mut book, "Orders", &[rule()]).unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(5.));
    // 非历史写入改变值，但不能改变筛选前后像。
    book.set_cell(0, "A2", Value::Number(4.));
    history.reapply_table_filter(&mut book, "Orders").unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    let scans = book.debug_filter_scan_count(0);
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.filter_hidden_rows(0), vec![1]);
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(5.));
        history.redo(&mut book).unwrap();
        assert!(book.filter_hidden_rows(0).is_empty());
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(9.));
    }
    history.clear_table_filter(&mut book, "Orders").unwrap();
    assert!(book.get_table("Orders").unwrap().auto_filter().is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().auto_filter().unwrap().rules(), &[rule()]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
}

#[test]
fn rejection_and_noop_preserve_redo_and_other_scopes() {
    let (mut book, mut history) = seed();
    book.define_table(Some("Other"), 0, range("A8", "B10"), true).unwrap();
    book.apply_table_filter("Other", &[rule()]).unwrap();
    book.apply_filter_range(0, range("A12", "B14"), &[rule()]).unwrap();
    history.apply_table_filter(&mut book, "Orders", &[rule()]).unwrap();
    history.undo(&mut book).unwrap();
    let tables = book.snapshot_tables();
    let filters = book.snapshot_filters();
    let hidden = book.filter_hidden_rows(0);
    history.clear_table_filter(&mut book, "Orders").unwrap();
    let outside = ColumnFilterRule::Range { col_index: 2, min: Some(2.), max: None };
    assert!(history.apply_table_filter(&mut book, "Orders", &[outside]).is_err());
    assert!(history.reapply_table_filter(&mut book, "Missing").is_err());
    assert_eq!(history.redo_count(), 1);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.snapshot_filters(), filters);
    assert_eq!(book.filter_hidden_rows(0), hidden);
    history.redo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 8, 9, 12, 13]);
}
