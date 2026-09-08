use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> CellRange {
    CellRange::new(CellAddress::new(start_row, start_col), CellAddress::new(end_row, end_col))
}

#[test]
fn sizes_are_sparse_axis_metadata_and_do_not_change_cells_or_formulas() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B2", Value::Number(7.0));
    wb.set_formula(0, "C2", "=B2*2");
    let sheet = wb.sheet_mut(0).unwrap();
    sheet.resize_range(range(1, 1, 3, 2), "row", 40).unwrap();
    sheet.resize_range(range(1, 1, 3, 2), "column", 200).unwrap();
    assert_eq!(sheet.all_row_heights(), vec![(1, 40), (2, 40), (3, 40)]);
    assert_eq!(sheet.all_col_widths(), vec![(1, 200), (2, 200)]);
    assert_eq!(sheet.row_height(0), None);
    assert_eq!(sheet.col_width(0), None);
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(14.0));
}

#[test]
fn reset_only_clears_target_axis_sizes_and_keeps_formatting() {
    let mut wb = Workbook::new();
    let sheet = wb.sheet_mut(0).unwrap();
    let mut format = einfach_excel_core::format::CellFormat::default();
    format.bold = true;
    sheet.set_format("B2", format);
    sheet.resize_range(range(0, 0, 3, 3), "row", 40).unwrap();
    sheet.resize_range(range(0, 0, 3, 3), "column", 200).unwrap();
    sheet.resize_range(range(1, 1, 2, 2), "reset", 0).unwrap();
    assert_eq!(sheet.all_row_heights(), vec![(0, 40), (3, 40)]);
    assert_eq!(sheet.all_col_widths(), vec![(0, 200), (3, 200)]);
    assert!(sheet.effective_format("B2").bold);
}

#[test]
fn invalid_sizes_and_ranges_reject_without_partial_writes() {
    let mut wb = Workbook::new();
    let sheet = wb.sheet_mut(0).unwrap();
    for (axis, pixels) in [("row", 15), ("row", 513), ("column", 39), ("column", 1025),
        ("reset", 1), ("unknown", 40)] {
        assert!(sheet.resize_range(range(0, 0, 3, 3), axis, pixels).is_err());
    }
    for invalid in [range(4, 0, 1, 0), range(0, 4, 0, 1), range(0, 0, 1_048_576, 0),
        range(0, 0, 0, 16_384)] {
        assert!(sheet.resize_range(invalid, "row", 40).is_err());
    }
    assert!(sheet.all_row_heights().is_empty());
    assert!(sheet.all_col_widths().is_empty());
}

#[test]
fn row_can_shrink_even_when_cell_has_a_large_font() {
    let mut wb = Workbook::new();
    let sheet = wb.sheet_mut(0).unwrap();
    let mut format = einfach_excel_core::format::CellFormat::default();
    format.font_size = Some(36);
    sheet.set_format("A1", format);
    assert!(sheet.row_height(0).unwrap() > 36);
    sheet.resize_range(range(0, 0, 0, 0), "row", 16).unwrap();
    assert_eq!(sheet.row_height(0), Some(16));
    assert_eq!(sheet.effective_format("A1").font_size, Some(36));
}

#[test]
fn reset_of_entire_blank_sheet_leaves_no_dimensions() {
    let mut wb = Workbook::new();
    let sheet = wb.sheet_mut(0).unwrap();
    sheet.resize_range(range(0, 0, 1_048_575, 16_383), "reset", 0).unwrap();
    assert!(sheet.all_row_heights().is_empty());
    assert!(sheet.all_col_widths().is_empty());
}
