use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, FilterSnapshot,
    SheetFilterState, Workbook};
use einfach_excel_core::advanced_filter::ColumnFilterGroup;
use einfach_excel_core::filter::{FilterTopAmount, FilterTopDirection};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn area() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 0))
}
fn rule(amount: FilterTopAmount) -> ColumnFilterRule {
    ColumnFilterRule::Top { col_index: 0, direction: FilterTopDirection::Top, amount }
}
fn book() -> Workbook {
    let mut book = Workbook::new();
    for row in 1..=4 { book.set_cell(0, &format!("A{row}"), Value::Number(row as f64)); }
    book
}

#[test]
fn edits_do_not_reapply_and_undo_restores_snapshot_without_rescanning() {
    let mut book = book();
    let mut history = WorkbookHistory::default();
    book.hide_rows(0, &[3]);
    history.apply_filter_range(&mut book, 0, area(), &[rule(FilterTopAmount::Items(1))]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    book.set_cell(0, "A2", Value::Number(10.));
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![2, 3]);
    let scans = book.debug_filter_scan_count(0);
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
    history.undo(&mut book).unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    assert_eq!(book.list_hidden_rows(0), vec![3]);
    history.redo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
}

#[test]
fn visibility_dependent_scores_are_frozen_once_per_apply_without_a_fixed_point_loop() {
    let mut book = Workbook::new();
    book.set_cell(0, "B2", Value::Number(1.));
    book.set_cell(0, "B3", Value::Number(10.));
    book.set_formula(0, "A2", "=SUBTOTAL(9,B2:B3)");
    book.set_cell(0, "A3", Value::Number(5.));
    let area = CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 1));
    let mut history = WorkbookHistory::default();
    history.apply_filter_range(&mut book, 0, area, &[rule(FilterTopAmount::Items(1))]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(1.));
    assert_eq!(book.debug_filter_scan_count(0), 1);
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1]);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(10.));
    assert_eq!(book.debug_filter_scan_count(0), 2);
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(1.));
    assert_eq!(book.debug_filter_scan_count(0), 2);
}

#[test]
fn every_entry_rejects_invalid_amount_before_mutation_even_with_no_table_data() {
    for amount in [FilterTopAmount::Items(0), FilterTopAmount::Items(501),
        FilterTopAmount::Percent(0), FilterTopAmount::Percent(101)] {
        let mut book = book();
        let valid = [rule(FilterTopAmount::Items(1))];
        book.apply_filter_range(0, area(), &valid).unwrap();
        book.define_table(Some("Scores"), 0, area(), true).unwrap();
        let filters = book.snapshot_filters();
        let tables = book.snapshot_tables();
        let scans = book.debug_filter_scan_count(0);
        let invalid = [rule(amount)];
        assert!(book.apply_filter(0, &invalid).is_err());
        assert!(book.apply_filter_range(0, area(), &invalid).is_err());
        assert!(book.apply_table_filter("Scores", &invalid).is_err());
        assert!(book.apply_filter_groups(0, &[ColumnFilterGroup { rules: invalid.to_vec() }]).is_err());
        assert!(book.restore_filters(FilterSnapshot::from_sheets(vec![SheetFilterState {
            sheet_index: 0, range: Some(area()), rules: invalid.to_vec(), groups: vec![], hidden_rows: vec![],
        }])).is_err());
        assert_eq!(book.snapshot_filters(), filters);
        assert_eq!(book.snapshot_tables(), tables);
        assert_eq!(book.debug_filter_scan_count(0), scans);
        book.define_table(Some("Empty"), 0,
            CellRange::single(CellAddress::new(8, 3)), true).unwrap();
        let invalid = ColumnFilterRule::Top { col_index: 3,
            direction: FilterTopDirection::Top, amount };
        assert!(book.apply_table_filter("Empty", &[invalid]).is_err());
    }
}
