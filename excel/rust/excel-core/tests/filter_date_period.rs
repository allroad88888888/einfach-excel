use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, FilterSnapshot, SheetFilterState, Workbook};
use einfach_excel_core::filter::FilterDatePeriod;
use einfach_excel_core::advanced_filter::ColumnFilterGroup;
use einfach_excel_core::workbook_history::WorkbookHistory;

fn rule(period: FilterDatePeriod) -> ColumnFilterRule {
    ColumnFilterRule::DatePeriod { col_index: 1, period }
}
fn area() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(8, 1))
}
fn seed() -> Workbook {
    let mut book = Workbook::new();
    for row in 1..=9 { book.set_cell(0, &format!("A{row}"), Value::Text(format!("Row{row}").into())); }
    for (address, formula) in [("B1", "=TODAY()"), ("B2", "=TODAY()-1"),
        ("B3", "=TODAY()"), ("B4", "=TODAY()+0.99"), ("B5", "=TODAY()+1"),
        ("B6", "=TEXT(TODAY(),\"0\")"), ("B7", "=1/0")] {
        book.set_formula(0, address, formula);
    }
    book.set_cell(0, "B8", Value::Boolean(true));
    book
}

#[test]
fn ordinary_legacy_and_table_share_typed_calendar_semantics() {
    for scope in 0..3 {
        let mut book = seed();
        let rules = [rule(FilterDatePeriod::Today)];
        let result = match scope {
            0 => book.apply_filter(0, &rules).unwrap(),
            1 => book.apply_filter_range(0, area(), &rules).unwrap(),
            _ => {
                book.define_table(Some("Dates"), 0, area(), true).unwrap();
                book.set_table_totals_row("Dates", true).unwrap();
                book.set_formula(0, "B10", "=TODAY()+1");
                book.apply_table_filter("Dates", &rules).unwrap()
            },
        };
        assert_eq!(result.hidden_rows, vec![1, 4, 5, 6, 7, 8], "scope {scope}");
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("Row1".into()));
    }
}

#[test]
fn groups_on_one_column_resolve_independent_periods_before_combining() {
    let mut book = seed();
    let groups = [ColumnFilterGroup { rules: vec![rule(FilterDatePeriod::Yesterday)] },
        ColumnFilterGroup { rules: vec![rule(FilterDatePeriod::Tomorrow)] }];
    assert_eq!(book.apply_filter_range_groups(0, area(), &groups).unwrap().hidden_rows,
        vec![2, 3, 5, 6, 7, 8]);
    let same_group = [ColumnFilterGroup { rules: vec![rule(FilterDatePeriod::Yesterday),
        rule(FilterDatePeriod::Tomorrow)] }];
    assert_eq!(book.apply_filter_range_groups(0, area(), &same_group).unwrap().hidden_rows,
        (1..=8).collect::<Vec<_>>());
}

#[test]
fn date_history_and_restore_keep_stored_visibility_until_explicit_reapply() {
    let mut book = seed();
    let mut history = WorkbookHistory::default();
    history.apply_filter_range(&mut book, 0, area(), &[rule(FilterDatePeriod::Today)]).unwrap();
    let stored = book.snapshot_filters();
    book.set_formula(0, "B2", "=TODAY()+0.5");
    assert_eq!(book.filter_hidden_rows(0), vec![1, 4, 5, 6, 7, 8]);
    history.reapply_filter(&mut book, 0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![4, 5, 6, 7, 8]);
    let scans = book.debug_filter_scan_count(0);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_filters(), stored);
    assert_eq!(book.debug_filter_scan_count(0), scans);
    history.redo(&mut book).unwrap();
    book.restore_filters(stored).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 4, 5, 6, 7, 8]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
}

#[test]
fn spill_scalars_match_dates_and_legacy_summary_remains_visible() {
    let mut book = Workbook::new();
    book.set_formula(0, "B2", "=SEQUENCE(3,1,TODAY()-1,1)");
    book.set_cell(0, "A5", Value::Text("Summary".into()));
    book.set_formula(0, "B5", "=TODAY()+1");
    let rules = [rule(FilterDatePeriod::Today)];
    assert_eq!(book.apply_filter(0, &rules).unwrap().hidden_rows, vec![1, 3]);
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 1));
    assert_eq!(book.apply_filter_range(0, range, &rules).unwrap().hidden_rows, vec![1, 3, 4]);
}

#[test]
fn date_column_validation_precedes_empty_scans_and_snapshot_mutations() {
    let mut book = seed();
    book.apply_filter_range(0, area(), &[rule(FilterDatePeriod::Today)]).unwrap();
    book.define_table(Some("Empty"), 0, CellRange::single(CellAddress::new(9, 3)), true).unwrap();
    let filters = book.snapshot_filters();
    let tables = book.snapshot_tables();
    let scans = book.debug_filter_scan_count(0);
    let invalid = ColumnFilterRule::DatePeriod { col_index: 16384, period: FilterDatePeriod::Today };
    assert!(book.apply_filter(0, &[invalid.clone()]).is_err());
    assert!(book.apply_table_filter("Empty", &[invalid.clone()]).is_err());
    assert!(book.apply_filter_groups(0, &[ColumnFilterGroup { rules: vec![invalid.clone()] }]).is_err());
    assert!(book.restore_filters(FilterSnapshot::from_sheets(vec![SheetFilterState {
        sheet_index: 0, range: None, rules: vec![invalid], groups: vec![], hidden_rows: vec![1],
    }])).is_err());
    assert_eq!(book.snapshot_filters(), filters);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.debug_filter_scan_count(0), scans);
}
