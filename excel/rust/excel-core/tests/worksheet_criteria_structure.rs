use einfach_core::Value;
use einfach_excel_core::advanced_filter::{
    AdvancedFilterSelection, FilterRangeRef, PersistedCriteriaRange,
};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn reference(sheet: usize, start: &str, end: &str) -> FilterRangeRef {
    let range = CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    );
    FilterRangeRef { sheet, range }
}

fn seed(book: &mut Workbook, source: usize, criteria: usize) {
    for (sheet, addr, value) in [
        (source, "A1", "Name"),
        (source, "A2", "Alpha"),
        (source, "A3", "Beta"),
        (criteria, "A5", "Name"),
        (criteria, "A6", "Al"),
    ] {
        book.set_cell(sheet, addr, Value::Text(value.into()));
    }
    book.apply_advanced_filter_range(AdvancedFilterSelection {
        source: reference(source, "A1", "A3"),
        criteria: Some(reference(criteria, "A5", "A6")),
        unique_only: false,
    })
    .unwrap();
}

#[test]
fn duplicated_sheet_uses_its_local_criteria_and_keeps_original_filter_independent() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    seed(&mut book, 0, 0);
    let copy = history.duplicate_sheet(&mut book, 0).unwrap();
    assert_eq!(
        book.filter_range_criteria(copy).unwrap().criteria,
        Some(PersistedCriteriaRange::Range(reference(copy, "A5", "A6")))
    );
    book.set_cell(copy, "A6", Value::Text("Beta".into()));
    assert_eq!(book.reapply_filter(copy).unwrap().hidden_rows, [1]);
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [2]);
}

#[test]
fn table_header_insertion_follows_the_criteria_only_in_its_column_band() {
    let mut book = Workbook::new();
    let criteria = book.add_sheet("Rules");
    let mut history = WorkbookHistory::default();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts(
            "Orders",
            "Rules",
            reference(criteria, "A1", "B2").range,
            false,
            false,
            vec!["Quantity".into(), "Amount".into()],
        ),
    ]))
    .unwrap();
    seed(&mut book, 0, criteria);
    let original = book.snapshot_filters();
    history
        .set_table_headers(&mut book, "Orders", true, 100)
        .unwrap();
    assert_eq!(
        book.filter_range_criteria(0).unwrap().criteria,
        Some(PersistedCriteriaRange::Range(reference(
            criteria, "A6", "A7"
        )))
    );
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [2]);
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.snapshot_filters(), original);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [2]);
}
