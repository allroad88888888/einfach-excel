use super::groups::{equals, example, group, range, seed};
use einfach_core::Value;
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::FilterError;

#[test]
fn two_tables_and_plain_range_are_independent_and_headers_totals_stay_visible() {
    let mut book = seed();
    book.define_table(Some("FirstOrders"), 0, range("A1", "B5"), true).unwrap();
    book.set_table_totals_row("FirstOrders", true).unwrap();
    book.define_table(Some("SecondOrders"), 0, range("A9", "B12"), true).unwrap();
    book.apply_table_filter_groups("FirstOrders", &example()).unwrap();
    let first = book.get_table("FirstOrders").unwrap().auto_filter().unwrap().clone();
    book.apply_table_filter_groups("SecondOrders", &[group(vec![equals(0, "keep")])]).unwrap();
    let second = book.get_table("SecondOrders").unwrap().auto_filter().unwrap().clone();
    book.apply_filter_range_groups(0, range("A15", "B18"), &[group(vec![equals(0, "keep")])]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![3, 4, 9, 10, 11, 15, 16, 17]);
    assert_eq!(book.get_table("FirstOrders").unwrap().auto_filter(), Some(&first));
    assert_eq!(book.get_table("SecondOrders").unwrap().auto_filter(), Some(&second));
    book.clear_filter(0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![3, 4, 9, 10, 11]);
    book.clear_table_filter("FirstOrders").unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![9, 10, 11]);
}

#[test]
fn grouped_table_history_and_protection_rejection_keep_redo() {
    let mut book = seed();
    book.define_table(Some("Orders"), 0, range("A1", "B5"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.apply_table_filter_groups(&mut book, "Orders", &example()).unwrap();
    let after = book.snapshot_tables();
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(history.apply_filter_groups(&mut book, 0, &example()), Err(FilterError::ProtectedWorksheet));
    assert!(history.apply_table_filter_groups(&mut book, "Orders", &example()).is_err());
    assert_eq!(history.redo_count(), 1);
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), after);
    book.set_cell(0, "A2", Value::Text("East".into()));
    assert_eq!(book.filter_hidden_rows(0), vec![3, 4]);
    history.reapply_table_filter(&mut book, "Orders").unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 3, 4]);
    assert_eq!(book.get_table("Orders").unwrap().auto_filter().unwrap().groups(), example());
}

#[test]
fn plain_and_table_groups_shift_columns_without_rescanning_or_empty_or_branches() {
    for table in [false, true] {
        let mut book = seed();
        if table {
            book.define_table(Some("Orders"), 0, range("A1", "B5"), true).unwrap();
            book.apply_table_filter_groups("Orders", &example()).unwrap();
        } else { book.apply_filter_range_groups(0, range("A1", "B5"), &example()).unwrap(); }
        let scans = book.debug_filter_scan_count(0);
        let mut history = WorkbookHistory::default();
        history.edit_structure(&mut book, 0, ShiftEdit::ColInsert { at: 0, count: 1 }).unwrap();
        let groups = if table { book.get_table("Orders").unwrap().auto_filter().unwrap().groups().to_vec() }
            else { book.filter_groups(0) };
        assert_eq!(groups[0].rules[0].col_index(), 1);
        assert_eq!(book.filter_hidden_rows(0), vec![3, 4]);
        history.undo(&mut book).unwrap();
        history.edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 0, count: 2 }).unwrap();
        assert!(book.filter_hidden_rows(0).is_empty());
        assert_eq!(book.debug_filter_scan_count(0), scans);
    }
}

#[test]
fn explicit_thousand_record_scope_never_hides_outside_rows_or_touches_manual_rows() {
    let mut book = seed();
    for row in 10..1010 { book.set_cell(0, &format!("A{row}"), Value::Text(if row % 2 == 0 { "West" } else { "East" }.into())); }
    book.hide_rows(0, &[2, 1009]);
    book.apply_filter_range_groups(0, range("A9", "B1009"), &[group(vec![equals(0, "West")])]).unwrap();
    let hidden = book.filter_hidden_rows(0);
    assert_eq!(hidden.len(), 500);
    assert!(hidden.iter().all(|row| (9..=1008).contains(row)));
    assert_eq!(book.list_hidden_rows(0), vec![2, 1009]);
}

#[test]
fn used_extent_groups_keep_column_identity_across_structure_without_rescanning() {
    let mut book = seed();
    book.apply_filter_groups(0, &example()).unwrap();
    let scans = book.debug_filter_scan_count(0);
    book.insert_columns(0, 0, 1);
    assert_eq!(book.filter_groups(0)[0].rules[0].col_index(), 1);
    assert_eq!(book.filter_hidden_rows(0), vec![3, 4]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
}
