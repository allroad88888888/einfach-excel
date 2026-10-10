use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellRange, ColumnFilterRule, FilterError, FilterSnapshot, Workbook,
};

fn r(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn west() -> Vec<ColumnFilterRule> {
    vec![ColumnFilterRule::Equals {
        col_index: 1,
        value: "West".into(),
        case_sensitive: false,
    }]
}
fn book() -> Workbook {
    let mut book = Workbook::new();
    for (address, text) in [
        ("B1", "Outside"),
        ("B3", "Team"),
        ("B4", "West"),
        ("B5", "East"),
        ("B6", "West"),
        ("B7", "Outside"),
    ] {
        book.set_cell(0, address, Value::Text(text.into()));
    }
    book
}

#[test]
fn only_data_rows_inside_the_explicit_range_are_tested_even_with_distant_content() {
    let mut book = book();
    book.set_cell(0, "Z1000000", Value::Text("Far away".into()));
    let report = book.apply_filter_range(0, r("B3", "D6"), &west()).unwrap();
    assert_eq!(report.hidden_rows, vec![4]);
    assert_eq!((report.scanned_rows, report.predicate_cells), (3, 3));
    assert_eq!(book.filter_range(0), Some(r("B3", "D6")));
    book.set_cell(0, "B7", Value::Text("East".into()));
    book.set_cell(0, "B4", Value::Text("East".into()));
    assert_eq!(book.filter_hidden_rows(0), vec![4]);
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, vec![3, 4]);
}

#[test]
fn explicit_range_never_guesses_that_a_total_named_record_is_a_summary() {
    let mut book = book();
    book.set_cell(0, "A6", Value::Text("Total".into()));
    book.set_cell(0, "B6", Value::Text("East".into()));
    assert_eq!(
        book.apply_filter_range(0, r("B3", "D6"), &west())
            .unwrap()
            .hidden_rows,
        vec![4, 5]
    );
}

#[test]
fn empty_rules_keep_the_range_and_are_scan_free_while_clear_removes_it() {
    let mut book = book();
    let range = r("B3", "D6");
    let mut history = WorkbookHistory::default();
    history
        .apply_filter_range(&mut book, 0, range, &west())
        .unwrap();
    let scans = book.debug_filter_scan_count(0);
    history
        .apply_filter_range(&mut book, 0, range, &[])
        .unwrap();
    assert_eq!(book.debug_filter_scan_count(0), scans);
    assert_eq!(book.filter_range(0), Some(range));
    assert!(book.filter_hidden_rows(0).is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![4]);
    history.redo(&mut book).unwrap();
    history.clear_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_range(0), None);
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_range(0), Some(range));
    assert_eq!(book.debug_filter_scan_count(0), scans);
}

#[test]
fn range_replacement_and_persistence_restore_the_exact_old_scope_and_snapshot() {
    let mut book = book();
    let mut history = WorkbookHistory::default();
    history
        .apply_filter_range(&mut book, 0, r("B3", "D6"), &west())
        .unwrap();
    let before = book.snapshot_filters();
    history
        .apply_filter_range(&mut book, 0, r("B1", "B2"), &west())
        .unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_filters(), before);
    book.clear_filter(0).unwrap();
    book.set_cell(0, "B5", Value::Text("West".into()));
    let scans = book.debug_filter_scan_count(0);
    book.restore_filters(before.clone()).unwrap();
    assert_eq!(book.snapshot_filters(), before);
    assert_eq!(book.debug_filter_scan_count(0), scans);
    book.reapply_filter(0).unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn invalid_range_column_budget_or_snapshot_rejects_atomically() {
    let mut book = book();
    book.apply_filter_range(0, r("B3", "D6"), &west()).unwrap();
    let before = book.snapshot_filters();
    for range in [r("B3", "B3"), r("B6", "B3"), r("C3", "D6")] {
        assert_eq!(
            book.apply_filter_range(0, range, &west()),
            Err(FilterError::InvalidRange)
        );
        assert_eq!(book.snapshot_filters(), before);
    }
    assert!(matches!(
        book.apply_filter_range(0, r("B1", "D50002"), &west()),
        Err(FilterError::SourceTooLarge { .. })
    ));
    assert_eq!(book.snapshot_filters(), before);
    let mut entries = before.sheets().to_vec();
    entries[0].hidden_rows.push(0);
    assert_eq!(
        book.restore_filters(FilterSnapshot::from_sheets(entries)),
        Err(FilterError::InvalidRange)
    );
    assert_eq!(book.snapshot_filters(), before);
}
