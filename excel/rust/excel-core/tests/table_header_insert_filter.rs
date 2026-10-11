//! 表头腾位搬筛选快照，不偷偷重算匹配结果或搬动手动隐藏行。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn rule() -> ColumnFilterRule {
    ColumnFilterRule::Range { col_index: 1, min: Some(15.), max: None }
}
fn seed(first: &str, last: &str) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range(first, last), false, false, vec!["Qty".into(), "Amount".into()],
    )])).unwrap();
    for (address, value) in [("B6", 10.), ("B7", 20.), ("B8", 30.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    (book, WorkbookHistory::default())
}

#[test]
fn moved_filter_keeps_snapshot_and_manual_rows_and_publishes_dependent_arrays() {
    let (mut book, mut history) = seed("A1", "B2");
    book.apply_filter_range(0, range("A5", "B8"), &[rule()]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![5]);
    book.set_cell(0, "B6", Value::Number(25.)); // 现在满足条件，但未按“重新应用”。
    book.hide_rows(0, &[7]);
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=SUBTOTAL(9,Sheet1!B6:B8)");
    book.set_formula(1, "D1", "=SUBTOTAL(109,Sheet1!B6:B8)");
    book.set_formula(1, "F1", "=IF(SUBTOTAL(109,Sheet1!B6:B8)>25,SEQUENCE(2),SEQUENCE(1))");
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(50.));
    assert_eq!(book.get_cell("Report", "D1"), Value::Number(20.));
    assert_eq!(book.get_cell("Report", "F2"), Value::Null);
    let before = book.snapshot_filters();
    let scans = book.debug_filter_scan_count(0);
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(book.filter_range(0), Some(range("A6", "B9")));
        assert_eq!(book.filter_hidden_rows(0), vec![6]);
        assert_eq!(book.filter_rules(0), vec![rule()]);
        assert_eq!(book.list_hidden_rows(0), vec![7]);
        assert_eq!(book.get_cell("Report", "F2"), Value::Number(2.));
        assert_eq!(book.get_cell("Report", "D1"), Value::Number(30.));
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(50.));
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_filters(), before);
        assert_eq!(book.get_cell("Report", "F2"), Value::Null);
        assert_eq!(book.get_cell("Report", "D1"), Value::Number(20.));
        assert_eq!(book.list_hidden_rows(0), vec![7]);
        history.redo(&mut book).unwrap();
    }
    assert_eq!(book.debug_filter_scan_count(0), scans);
    book.reapply_filter(0).unwrap();
    assert!(book.filter_hidden_rows(0).is_empty());
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(75.));
}

#[test]
fn insertion_inside_filter_extends_its_range_and_keeps_new_row_visible() {
    let (mut book, mut history) = seed("A6", "B8");
    book.set_cell(0, "A5", Value::Text("Keep header".into()));
    book.apply_filter_range(0, range("A5", "B8"), &[rule()]).unwrap();
    let before = book.snapshot_filters();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.filter_range(0), Some(range("A5", "B9")));
    assert_eq!(book.filter_hidden_rows(0), vec![6]);
    assert_eq!(book.get_cell("Sheet1", "A6"), Value::Text("Qty".into()));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_filters(), before);
}

#[test]
fn outside_partial_and_legacy_filters_are_not_moved_by_local_cells() {
    for bounds in [Some(range("A5", "D8")), Some(range("D5", "E8")), None] {
        let (mut book, mut history) = seed("A1", "B2");
        if let Some(bounds) = bounds {
            book.apply_filter_range(0, bounds, &[ColumnFilterRule::Range {
                col_index: bounds.start.col.max(1), min: Some(15.), max: None,
            }]).unwrap();
        } else {
            book.apply_filter(0, &[rule()]).unwrap();
        }
        let before = book.snapshot_filters();
        let scans = book.debug_filter_scan_count(0);
        history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
        assert_eq!(book.snapshot_filters(), before);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_filters(), before);
        assert_eq!(book.debug_filter_scan_count(0), scans);
    }
}

#[test]
fn overflow_and_external_filter_edits_reject_before_touching_the_table() {
    let (mut book, mut history) = seed("A1", "B2");
    book.apply_filter_range(0, range("A99", "B100"), &[]).unwrap();
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_filters();
    assert!(history.set_table_headers(&mut book, "Orders", true, 100)
        .unwrap_err().contains("filter outside"));
    assert_eq!(book.snapshot_filters(), before);
    assert!(!book.get_table("Orders").unwrap().has_headers());
    assert_eq!(history.redo_count(), 1);
    book.apply_filter_range(0, range("A5", "B8"), &[rule()]).unwrap();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    book.apply_filter_range(0, range("D5", "E8"), &[]).unwrap();
    let filters = book.snapshot_filters();
    let tables = book.snapshot_tables();
    assert!(history.undo(&mut book).unwrap_err().contains("filter changed"));
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.snapshot_filters(), filters);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("Qty".into()));
    assert_eq!(history.undo_count(), 1);
}
