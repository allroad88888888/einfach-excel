use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, FilterError, Workbook};

fn fixture() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Team".into()));
    book.set_cell(0, "A2", Value::Text("West".into()));
    book.set_cell(0, "A3", Value::Text("East".into()));
    book.set_cell(0, "B2", Value::Number(10.0));
    book.set_cell(0, "B3", Value::Number(20.0));
    book.set_formula(0, "C1", "=SUBTOTAL(9,B2:B3)");
    (book, WorkbookHistory::default())
}

fn west() -> Vec<ColumnFilterRule> {
    vec![ColumnFilterRule::Equals {
        col_index: 0,
        value: "West".into(),
        case_sensitive: false,
    }]
}

#[test]
fn filter_undo_redo_preserves_manual_hiding_and_updates_subtotal() {
    let (mut book, mut history) = fixture();
    book.hide_rows(0, &[1]);
    let report = history.apply_filter(&mut book, 0, &west()).unwrap();
    assert_eq!(report.hidden_rows, vec![2]);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(10.0));
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut book).unwrap());
    assert!(book.filter_rules(0).is_empty());
    assert!(book.filter_hidden_rows(0).is_empty());
    assert_eq!(book.list_hidden_rows(0), vec![1]);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(30.0));
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(10.0));
}

#[test]
fn reapply_and_undo_are_snapshots_not_live_scans() {
    let (mut book, mut history) = fixture();
    history.apply_filter(&mut book, 0, &west()).unwrap();
    book.set_cell(0, "A2", Value::Text("East".into()));
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    let scans = book.debug_filter_scan_count(0);
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("East".into()));
    assert_eq!(book.debug_filter_scan_count(0), scans);
    history.redo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    history.clear_filter(&mut book, 0).unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
}

#[test]
fn no_op_does_not_record_and_pending_history_rejects_without_writing() {
    let (mut book, mut history) = fixture();
    history.clear_filter(&mut book, 0).unwrap();
    assert_eq!(history.undo_count(), 0);
    history.apply_filter(&mut book, 0, &west()).unwrap();
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(history.undo_count(), 1);
    history
        .begin(
            &book,
            0,
            CellRange::single(CellAddress::new(0, 0)),
            "Edit",
            true,
        )
        .unwrap();
    assert_eq!(
        history.clear_filter(&mut book, 0),
        Err(FilterError::HistoryPending)
    );
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    history.finish(&mut book, false).unwrap();
}

#[test]
fn undo_only_restores_target_sheet_and_rejects_another_workbook() {
    let (mut book, mut history) = fixture();
    book.add_sheet("Other");
    book.set_cell(1, "A2", Value::Text("East".into()));
    history.apply_filter(&mut book, 0, &west()).unwrap();
    book.apply_filter(1, &west()).unwrap();
    assert!(history.undo(&mut Workbook::new()).is_err());
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(1), vec![1]);
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn over_budget_reapply_preserves_existing_filter_and_history() {
    let (mut book, mut history) = fixture();
    history.apply_filter(&mut book, 0, &west()).unwrap();
    book.set_cell(0, "A50001", Value::Text("West".into()));
    assert!(matches!(
        history.reapply_filter(&mut book, 0),
        Err(FilterError::SourceTooLarge { .. })
    ));
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(history.undo_count(), 1);
    // Clear must remain usable even when the scan has become too large.
    history.clear_filter(&mut book, 0).unwrap();
    assert!(book.filter_rules(0).is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
}
