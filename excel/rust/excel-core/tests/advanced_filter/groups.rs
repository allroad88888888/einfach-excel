use einfach_core::Value;
use einfach_excel_core::advanced_filter::ColumnFilterGroup;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, FilterError, Workbook};

pub fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
pub fn equals(col: u32, value: &str) -> ColumnFilterRule {
    ColumnFilterRule::Equals { col_index: col, value: value.into(), case_sensitive: false }
}
pub fn group(rules: Vec<ColumnFilterRule>) -> ColumnFilterGroup { ColumnFilterGroup { rules } }
pub fn seed() -> Workbook {
    let mut book = Workbook::new();
    for (row, region, amount) in [(2, "West", 20.), (3, "East", 10.), (4, "West", 10.), (5, "East", 30.)] {
        book.set_cell(0, &format!("A{row}"), Value::Text(region.into()));
        book.set_cell(0, &format!("B{row}"), Value::Number(amount));
    }
    book.set_formula(0, "D1", "=SUBTOTAL(9,B2:B5)");
    book
}
pub fn example() -> Vec<ColumnFilterGroup> {
    vec![group(vec![equals(0, "West"), ColumnFilterRule::Range { col_index: 1, min: Some(15.), max: None }]),
        group(vec![equals(0, "East"), equals(1, "10")])]
}

#[test]
fn or_groups_evaluate_and_conditions_preserve_subtotal_and_manual_visibility() {
    let mut book = seed();
    book.hide_rows(0, &[1]);
    let report = book.apply_filter_range_groups(0, range("A1", "B5"), &example()).unwrap();
    assert_eq!(report.hidden_rows, vec![3, 4]);
    assert_eq!((report.scanned_rows, report.predicate_cells), (4, 8));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(30.));
    assert_eq!(book.list_hidden_rows(0), vec![1]);
    assert_eq!(book.filter_groups(0), example());
    assert!(book.filter_rules(0).is_empty(), "group leaves are not duplicated as flat AND");
}

#[test]
fn legacy_flat_and_and_grouped_single_clause_are_equivalent() {
    let mut book = seed();
    let rules = example()[0].rules.clone();
    let flat = book.apply_filter_range(0, range("A1", "B5"), &rules).unwrap();
    let grouped = book.apply_filter_range_groups(0, range("A1", "B5"), &[group(rules)]).unwrap();
    assert_eq!(flat, grouped);
}

#[test]
fn multiple_conditions_on_the_same_column_are_intersected() {
    let mut book = seed();
    let report = book.apply_filter_groups(0, &[group(vec![
        ColumnFilterRule::Range { col_index: 1, min: Some(15.), max: None },
        ColumnFilterRule::Range { col_index: 1, min: None, max: Some(25.) },
    ])]).unwrap();
    assert_eq!(report.hidden_rows, vec![2, 3, 4]);
}

#[test]
fn empty_invalid_and_overbudget_groups_reject_atomically_without_consuming_redo() {
    let mut book = seed();
    let mut history = WorkbookHistory::default();
    history.apply_filter_groups(&mut book, 0, &example()).unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_filters();
    for groups in [vec![group(vec![])], vec![group(vec![equals(16_384, "bad")])],
        vec![group(vec![ColumnFilterRule::Range { col_index: 1, min: Some(10.), max: Some(1.) }])],
        vec![group(vec![equals(0, "West"); 9])], vec![group(vec![equals(0, "West")]); 9]] {
        assert_eq!(history.apply_filter_groups(&mut book, 0, &groups), Err(FilterError::InvalidGroups));
        assert_eq!(book.snapshot_filters(), before);
        assert_eq!(history.redo_count(), 1);
    }
    assert_eq!(history.apply_filter_range_groups(&mut book, 0, range("B1", "B5"), &example()),
        Err(FilterError::InvalidRange));
    book.set_cell(0, "A50001", Value::Text("far".into()));
    assert!(matches!(history.apply_filter_groups(&mut book, 0, &example()), Err(FilterError::SourceTooLarge { .. })));
    assert_eq!(book.snapshot_filters(), before);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn grouped_reapply_history_and_restore_replay_snapshots_without_live_scans() {
    let mut book = seed();
    let mut history = WorkbookHistory::default();
    history.apply_filter_range_groups(&mut book, 0, range("A1", "B5"), &example()).unwrap();
    let before = book.snapshot_filters();
    book.set_cell(0, "A2", Value::Text("East".into()));
    let scans = book.debug_filter_scan_count(0);
    assert_eq!(book.filter_hidden_rows(0), vec![3, 4]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 3, 4]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_filters(), before);
    history.redo(&mut book).unwrap();
    history.clear_filter(&mut book, 0).unwrap();
    book.restore_filters(before.clone()).unwrap();
    assert_eq!(book.snapshot_filters(), before);
    assert_eq!(book.debug_filter_scan_count(0), scans + 1);
}

#[test]
fn empty_groups_clear_without_scan_and_explicit_range_keeps_its_header() {
    let mut book = seed();
    book.apply_filter_range_groups(0, range("A1", "B5"), &example()).unwrap();
    let scans = book.debug_filter_scan_count(0);
    book.apply_filter_range_groups(0, range("A1", "B5"), &[]).unwrap();
    assert_eq!(book.filter_range(0), Some(range("A1", "B5")));
    assert!(book.filter_groups(0).is_empty());
    assert!(book.filter_hidden_rows(0).is_empty());
    assert_eq!(book.debug_filter_scan_count(0), scans);
}
