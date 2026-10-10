//! 原生去重：显示值键、表头、文本规则、范围隔离及一次历史。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_remove_duplicates::{DuplicateComparison as Compare, RemoveDuplicatesRequest};
use einfach_excel_core::{CellAddress, CellFormat, CellRange, NumberFormat, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn request(first: &str, last: &str) -> RemoveDuplicatesRequest {
    RemoveDuplicatesRequest { sheet: 0, range: range(first, last), columns: vec![0],
        has_header: false, comparison: Compare::Exact, row_count: 1000, col_count: 16 }
}
fn texts(wb: &mut Workbook, values: &[&str]) {
    for (row, value) in values.iter().enumerate() {
        wb.set_cell(0, &format!("A{}", row + 1), Value::Text((*value).into()));
        wb.set_cell(0, &format!("B{}", row + 1), Value::Number(row as f64));
    }
}

#[test]
fn first_record_wins_and_only_selected_rectangle_compacts() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "b", "a", "c"]);
    wb.set_cell(0, "C3", Value::Text("outside".into()));
    wb.set_cell(0, "A6", Value::Text("below".into()));
    let mut history = WorkbookHistory::default();
    let req = request("A1", "B5");
    let preview = wb.preview_remove_duplicates(&req).unwrap();
    assert_eq!((preview.scanned_rows, preview.removed_rows, preview.unique_rows), (5, 2, 3));
    assert_eq!((preview.sample[0].row, preview.sample[0].first_row), (1, 0));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("a".into()));
    assert_eq!(history.remove_duplicates(&mut wb, &req).unwrap(), preview);
    for (addr, value) in [("A1", "a"), ("A2", "b"), ("A3", "c"), ("A6", "below"), ("C3", "outside")] {
        assert_eq!(wb.get_cell("Sheet1", addr), Value::Text(value.into()));
    }
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(4.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn column_tuples_are_order_independent_and_do_not_confuse_embedded_separators() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "a|b", "a", "a"]);
    for (addr, value) in [("B1", "b|c"), ("B2", "b|c"), ("B3", "c"), ("B4", "d"), ("B5", "d")] {
        wb.set_cell(0, addr, Value::Text(value.into()));
    }
    let mut req = request("A1", "B5");
    req.columns = vec![1, 0];
    let first = wb.preview_remove_duplicates(&req).unwrap();
    req.columns.reverse();
    assert_eq!(first, wb.preview_remove_duplicates(&req).unwrap());
    assert_eq!((first.removed_rows, first.unique_rows), (2, 3));
}

#[test]
fn header_is_not_a_comparison_record_and_stays_at_its_address() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["Name", "Name", "Name", "Other"]);
    let mut req = request("A1", "B4");
    req.has_header = true;
    let preview = wb.preview_remove_duplicates(&req).unwrap();
    assert_eq!(preview.headers, ["Name", "0"]);
    assert_eq!((preview.scanned_rows, preview.removed_rows), (3, 1));
    WorkbookHistory::default().remove_duplicates(&mut wb, &req).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(0.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Other".into()));
}

#[test]
fn four_comparison_modes_are_explicit_and_unicode_lowercase_is_deterministic() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["Ä", "ä", " Ä ", " ä "]);
    for (comparison, removed) in [(Compare::Exact, 0), (Compare::IgnoreCase, 2),
        (Compare::Trim, 2), (Compare::TrimIgnoreCase, 3)] {
        let mut req = request("A1", "A4");
        req.comparison = comparison;
        assert_eq!(wb.preview_remove_duplicates(&req).unwrap().removed_rows, removed);
    }
}

#[test]
fn formulas_compare_by_display_and_number_formats_can_distinguish_equal_values() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=2-1");
    wb.set_formula(0, "A2", "=3-2");
    wb.set_cell(0, "A3", Value::Number(1.0));
    wb.sheet_mut(0).unwrap().set_format("A3", CellFormat {
        number_format: NumberFormat::Decimal { digits: 2, thousands: false }, ..Default::default()
    });
    assert_eq!(wb.preview_remove_duplicates(&request("A1", "A3")).unwrap().removed_rows, 1);
}

#[test]
fn empty_cells_empty_formula_and_empty_text_are_comparable_not_omitted() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A2", "=\"\"");
    wb.set_cell(0, "A3", Value::Text(String::new()));
    let result = wb.preview_remove_duplicates(&request("A1", "A4")).unwrap();
    assert_eq!((result.scanned_rows, result.removed_rows, result.unique_rows), (4, 3, 1));
}

#[test]
fn source_formula_and_cell_style_move_but_dimensions_and_outside_formulas_do_not() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "b"]);
    wb.set_formula(0, "B3", "=D3+1");
    wb.set_cell(0, "D3", Value::Number(8.0));
    wb.sheet_mut(0).unwrap().set_format("B3", CellFormat { bold: true, italic: true, ..Default::default() });
    wb.sheet_mut(0).unwrap().set_row_height(2, 64);
    wb.add_sheet("Other");
    wb.set_formula(1, "A1", "=Sheet1!B2");
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(1.0));
    let before = wb.sheet(0).unwrap().snapshot_format_range(range("A1", "B3"));
    let mut history = WorkbookHistory::default();
    history.remove_duplicates(&mut wb, &request("A1", "B3")).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_formula("B2").as_deref(), Some("=D3+1"));
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(9.0));
    assert!(wb.sheet(0).unwrap().get_format("B2").bold);
    assert!(!wb.sheet(0).unwrap().get_format("B3").bold);
    assert_eq!(wb.sheet(0).unwrap().row_height(2), Some(64));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().snapshot_format_range(range("A1", "B3")), before);
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(1.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(9.0));
}

#[test]
fn filter_hidden_rows_stay_in_place_while_manual_hidden_rows_participate() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "a", "b", "a"]);
    wb.set_eval_filter_hidden_rows(0, &[1]);
    wb.hide_rows(0, &[4]);
    let req = request("A1", "B5");
    let result = wb.preview_remove_duplicates(&req).unwrap();
    assert_eq!((result.scanned_rows, result.excluded_rows, result.removed_rows), (4, 1, 2));
    WorkbookHistory::default().remove_duplicates(&mut wb, &req).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("b".into()));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "A5"), Value::Null);
    assert_eq!(wb.filter_hidden_rows(0), vec![1]);
}

#[test]
fn full_scan_is_not_limited_to_twenty_preview_rows() {
    let mut wb = Workbook::new();
    for row in 1..=400 { wb.set_cell(0, &format!("A{row}"), Value::Text("a".repeat(130))); }
    let req = request("A1", "A400");
    let result = wb.preview_remove_duplicates(&req).unwrap();
    assert_eq!((result.removed_rows, result.sample.len()), (399, 20));
    assert_eq!(result.sample[0].values[0].len(), 120);
    assert!(result.sample_truncated);
    WorkbookHistory::default().remove_duplicates(&mut wb, &req).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A400"), Value::Null);
}

#[test]
fn invalid_keys_bounds_and_geometry_do_not_create_history_or_partial_changes() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a"]);
    let mut history = WorkbookHistory::default();
    for columns in [vec![], vec![0, 0], vec![2]] {
        let mut req = request("A1", "B2"); req.columns = columns;
        assert!(history.remove_duplicates(&mut wb, &req).is_err());
        assert_eq!(history.undo_count(), 0);
        assert!(!history.is_pending());
    }
    let mut req = request("A1", "B2"); req.row_count = 1;
    assert!(history.remove_duplicates(&mut wb, &req).is_err());
    wb.set_cell(0, "A2", Value::Null);
    wb.set_formula(0, "A1", "=SEQUENCE(2)");
    let _ = wb.get_cell("Sheet1", "A1");
    assert!(history.remove_duplicates(&mut wb, &request("A1", "A2")).is_err());
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn no_duplicates_and_preview_preserve_an_existing_redo_branch() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "b"]);
    let mut history = WorkbookHistory::default();
    history.remove_duplicates(&mut wb, &request("A1", "B3")).unwrap();
    history.undo(&mut wb).unwrap();
    wb.preview_remove_duplicates(&request("A1", "B3")).unwrap();
    let mut unique = request("A1", "B3"); unique.columns = vec![1];
    assert_eq!(history.remove_duplicates(&mut wb, &unique).unwrap().removed_rows, 0);
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(2.0));
}

#[test]
fn merged_cells_reject_and_empty_styled_cells_move_with_the_record() {
    let mut wb = Workbook::new();
    texts(&mut wb, &["a", "a", "b"]);
    wb.sheet_mut(0).unwrap().set_format("C3", CellFormat { underline: true, ..Default::default() });
    let mut history = WorkbookHistory::default();
    history.remove_duplicates(&mut wb, &request("A1", "C3")).unwrap();
    assert!(wb.sheet(0).unwrap().get_format("C2").underline);
    assert!(!wb.sheet(0).unwrap().get_format("C3").underline);
    history.undo(&mut wb).unwrap();
    wb.merge_cells(0, range("B1", "C1"), einfach_excel_core::MergeAction::Merge, true).unwrap();
    assert!(history.remove_duplicates(&mut wb, &request("A1", "C3")).is_err());
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
}

#[test]
fn lazy_array_in_a_non_key_column_cannot_be_silently_moved_or_removed() {
    let mut wb = Workbook::new();
    wb.bulk_load(|loader| {
        loader.set_cell(0, "A1", Value::Text("a".into()));
        loader.set_cell(0, "A2", Value::Text("a".into()));
        loader.set_formula(0, "C1", "=SEQUENCE(2)");
    });
    let mut history = WorkbookHistory::default();
    assert!(history.remove_duplicates(&mut wb, &request("A1", "C2")).is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("a".into()));
}
