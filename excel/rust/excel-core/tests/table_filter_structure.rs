//! 结构变更只搬移 Table 筛选快照；历史恢复相同可见性，绝不重扫。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (addr, value) in [("B4", 1.), ("B5", 2.), ("B6", 1.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("B3", "D6"), true).unwrap();
    book.apply_table_filter("Orders", &[ColumnFilterRule::Range {
        col_index: 1, min: Some(2.), max: None,
    }]).unwrap();
    (book, WorkbookHistory::default())
}

#[test]
fn row_and_column_edits_move_filter_coordinates_and_undo_restores_them() {
    for (edit, hidden, column) in [
        (ShiftEdit::RowInsert { at: 0, count: 2 }, vec![5, 7], Some(1)),
        (ShiftEdit::RowInsert { at: 4, count: 1 }, vec![3, 6], Some(1)),
        (ShiftEdit::RowDelete { at: 3, count: 1 }, vec![4], Some(1)),
        (ShiftEdit::ColInsert { at: 0, count: 2 }, vec![3, 5], Some(3)),
        (ShiftEdit::ColDelete { at: 0, count: 1 }, vec![3, 5], Some(0)),
        (ShiftEdit::ColDelete { at: 1, count: 1 }, vec![], None),
        (ShiftEdit::RowDelete { at: 2, count: 1 }, vec![], None),
        (ShiftEdit::ColDelete { at: 1, count: 3 }, vec![], None),
    ] {
        let (mut book, mut history) = seed();
        let before = book.snapshot_tables();
        let scans = book.debug_filter_scan_count(0);
        history.edit_structure(&mut book, 0, edit).unwrap();
        assert_eq!(book.filter_hidden_rows(0), hidden, "{edit:?}");
        let actual = book.get_table("Orders").and_then(|table| table.auto_filter())
            .and_then(|filter| filter.rules().first()).map(ColumnFilterRule::col_index);
        assert_eq!(actual, column, "{edit:?}");
        let after = book.snapshot_tables();
        for _ in 0..2 {
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.filter_hidden_rows(0), vec![3, 5], "undo {edit:?}");
            history.redo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), after);
            assert_eq!(book.filter_hidden_rows(0), hidden, "redo {edit:?}");
        }
        assert_eq!(book.debug_filter_scan_count(0), scans);
    }
}

#[test]
fn resize_clips_snapshot_and_hiding_headers_clears_only_table_filter() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    history.resize_table(&mut book, "Orders", range("B3", "D5")).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![3]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.filter_hidden_rows(0), vec![3, 5]);
    history.set_table_headers(&mut book, "Orders", false, 100).unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    assert!(book.get_table("Orders").unwrap().auto_filter().is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.filter_hidden_rows(0), vec![3, 5]);
}

#[test]
fn deletion_restore_and_conversion_republish_visibility() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    book.delete_table("Orders").unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    book.restore_tables(before.clone()).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![3, 5]);
    history.convert_table_to_range(&mut book, "Orders").unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.filter_hidden_rows(0), vec![3, 5]);
}

#[test]
fn append_moves_a_lower_table_filter_but_does_not_filter_the_new_record() {
    let (mut book, mut history) = seed();
    book.define_table(Some("LowerOrders"), 0, range("B8", "D10"), true).unwrap();
    let rule = ColumnFilterRule::Range { col_index: 1, min: Some(2.), max: None };
    book.apply_table_filter("LowerOrders", &[rule]).unwrap();
    let before = book.snapshot_tables();
    let scans = book.debug_filter_scan_count(0);
    history.append_table_row(&mut book, "Orders", 100).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![3, 5, 9, 10]);
    assert_eq!(book.get_table("LowerOrders").unwrap().range(), range("B9", "D11"));
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.filter_hidden_rows(0), vec![3, 5, 8, 9]);
        history.redo(&mut book).unwrap();
        assert_eq!(book.filter_hidden_rows(0), vec![3, 5, 9, 10]);
    }
    assert_eq!(book.debug_filter_scan_count(0), scans);
}

#[test]
fn malformed_restores_reject_without_changing_existing_visibility() {
    use einfach_excel_core::TableRegistrySnapshot;
    let (mut book, _) = seed();
    let before = book.snapshot_tables();
    let rule = ColumnFilterRule::Range { col_index: 1, min: Some(2.), max: None };
    let table = book.get_table("Orders").unwrap().clone();
    for invalid in [
        table.clone().with_filter(vec![rule.clone()], vec![2]),
        table.clone().with_filter(vec![rule], vec![6]),
        table.clone().with_filter(vec![], vec![3]),
        table.with_filter(vec![ColumnFilterRule::List { col_index: 5, values: vec![] }], vec![]),
    ] {
        assert!(book.restore_tables(TableRegistrySnapshot::from_entries(vec![invalid])).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.filter_hidden_rows(0), vec![3, 5]);
    }
}
