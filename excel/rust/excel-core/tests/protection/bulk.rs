//! Batch operations reject before the first write, including neighbors and other sheets.
use super::*;
use einfach_excel_core::{AutoFillDirection, AutoFillRequest, AutoFillSeries, FindLookIn,
    FindQuery, SortDirection, SortKey, BorderSpec, BorderStyle, sheet::BorderPreset};

#[test]
fn raw_and_inferred_fill_reject_a_locked_tail_without_changing_an_editable_prefix() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0));
    allow(&mut book, range(1, 0, 1, 0));
    protect(&mut book);
    let request = AutoFillRequest { sheet_idx: 0, source_range: range(0, 0, 0, 0),
        target_range: range(0, 0, 2, 0), direction: AutoFillDirection::Down,
        series: AutoFillSeries::Copy, step: None, text_pattern: None, list: None };
    assert!(book.apply_auto_fill(&request).is_err());
    assert!(book.apply_inferred_auto_fill(&request).is_err());
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    unprotect(&mut book);
    allow(&mut book, range(2, 0, 2, 0));
    protect(&mut book);
    assert_eq!(book.apply_auto_fill(&request).unwrap().written, 2);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(1.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(1.0));
}

#[test]
fn cut_rewriting_a_locked_formula_on_another_sheet_is_atomic() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    book.add_sheet("Other");
    book.set_formula(1, "A1", "=Sheet1!A1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    assert!(book.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range(1, 1, 1, 1))).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1"));
}

#[test]
fn paste_mixed_locked_targets_rejects_before_an_editable_prefix_and_keeps_history() {
    let mut book = Workbook::new();
    let text = ClipboardSnapshot::from_tsv("8\t9", ClipboardPasteMode::All).unwrap();
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    assert!(book.paste_clipboard_with_history(&text, 0,
        &ClipboardPasteOptions::new(range(1, 1, 1, 1)), &mut history).is_err());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn shared_border_cannot_write_a_locked_neighbor() {
    let mut book = Workbook::new();
    let pen = BorderSpec { style: BorderStyle::Thick, color: Some("#c00000".into()) };
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let before = book.sheet(0).unwrap().get_format("C2");
    let mut history = WorkbookHistory::default();
    assert!(history.patch_range_borders(&mut book, 0, range(1, 1, 1, 1),
        BorderPreset::Right, pen).is_err());
    assert_eq!(book.sheet(0).unwrap().get_format("C2"), before);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn sort_and_auto_fit_enforce_native_permissions() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(1.0));
    protect(&mut book);
    let keys = [SortKey { col: 0, direction: SortDirection::Ascending,
        case_sensitive: false, empty_first: false }];
    assert!(book.sort_range(0, range(0, 0, 1, 0), &keys, &[]).is_err());
    assert!(book.auto_fit_dimensions(0, range(0, 0, 1, 0), "column", 28, 120,
        |_, _, _| Ok(200.0)).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(book.sheet(0).unwrap().col_width(0), None);
}

#[test]
fn replace_and_multiarea_clear_do_not_partially_write_an_editable_prefix() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("old".into()));
    book.set_cell(0, "B1", Value::Text("old".into()));
    allow(&mut book, range(0, 0, 0, 0));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    let query = FindQuery { needle: "old".into(), case_sensitive: false, whole_cell: true,
        wildcards: false, look_in: FindLookIn::Formulas };
    assert!(history.replace_by_query(&mut book, &[(0, range(0, 0, 0, 1))],
        &query, "new", None).is_err());
    assert!(history.clear_selection(&mut book, 0, &[(range(0, 0, 0, 0), StyleScope::Cell),
        (range(0, 1, 0, 1), StyleScope::Cell)], ClearSelectionMode::All).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("old".into()));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("old".into()));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn text_columns_and_remove_duplicates_reject_mixed_editable_output_before_writing() {
    use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
    use einfach_excel_core::text_columns::TextColumnsMode;
    use einfach_excel_core::workbook_remove_duplicates::{DuplicateComparison, RemoveDuplicatesRequest};
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("left,right".into()));
    book.set_cell(0, "B2", Value::Number(7.0));
    book.set_cell(0, "B3", Value::Number(7.0));
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    let split = TextColumnsRequest { sheet: 0, source: range(0, 0, 0, 0),
        destination: CellAddress::new(1, 1), column_types: vec![], number_options: None,
        row_count: 100, col_count: 8, mode: TextColumnsMode::Delimited {
            delimiters: vec![','], merge_consecutive: false, qualifier: Some('"'),
        } };
    assert!(history.split_text_columns(&mut book, &split, true).is_err());
    let duplicates = RemoveDuplicatesRequest { sheet: 0, range: range(1, 1, 2, 1),
        columns: vec![1], has_header: false, comparison: DuplicateComparison::Exact,
        row_count: 100, col_count: 8 };
    assert!(history.remove_duplicates(&mut book, &duplicates).is_err());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn raw_input_cannot_activate_empty_table_metadata_inside_an_editable_range() {
    use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range(2, 0, 2, 1), false, false,
        vec!["Qty".into(), "Amount".into()]).with_insert_row(true)])).unwrap();
    allow(&mut book, range(2, 0, 2, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    assert!(history.set_cell_input(&mut book, 0, "A3", "7").is_err());
    book.set_cell(0, "A3", Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert!(book.try_set_cell(0, "A3", Value::Number(7.0)).is_err());
    unprotect(&mut book);
    book.add_sheet("Other");
    let text = ClipboardSnapshot::from_tsv("7", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&text, 0,
        &ClipboardPasteOptions::new(range(2, 0, 2, 0)), &mut history).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.0));
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
}
