use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, Workbook};

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> CellRange {
    CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1))
}

#[test]
fn offscreen_content_and_cross_sheet_formula_are_measured_with_effective_format() {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    wb.set_cell(1, "A1", Value::Number(7.0));
    wb.set_formula(0, "B1000000", "=Other!A1*3");
    wb.sheet_mut(0).unwrap().set_format("B1000000", CellFormat { bold: true, ..Default::default() });
    let mut calls = 0;
    assert!(wb.auto_fit_dimensions(0, range(0, 1, 1_048_575, 1), "column", 28, 120, |value, format, width| {
        assert_eq!(value, &Value::Number(21.0));
        assert!(format.bold);
        assert_eq!(width, 120.0);
        calls += 1;
        Ok(187.2)
    }).unwrap());
    assert_eq!(calls, 1);
    assert_eq!(wb.sheet(0).unwrap().all_col_widths(), vec![(1, 188)]);
    assert_eq!(wb.sheet(0).unwrap().get_formula("B1000000").unwrap(), "=Other!A1*3");
}

#[test]
fn each_row_uses_its_maximum_without_changing_other_rows_or_columns() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(60.0));
    wb.set_cell(0, "B2", Value::Number(90.0));
    wb.set_cell(0, "A3", Value::Number(35.0));
    wb.auto_fit_dimensions(0, range(1, 0, 2, 7), "row", 28, 120, |value, _, _| {
        Ok(match value { Value::Number(n) => *n, _ => 0.0 })
    }).unwrap();
    assert_eq!(wb.sheet(0).unwrap().all_row_heights(), vec![(1, 90), (2, 35)]);
    assert!(wb.sheet(0).unwrap().all_col_widths().is_empty());
}

#[test]
fn late_measurement_error_is_atomic_and_invalid_numbers_are_rejected() {
    for invalid in [f64::NAN, f64::INFINITY, -1.0] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(100.0));
        wb.set_cell(0, "B1", Value::Number(100.0));
        wb.sheet_mut(0).unwrap().set_col_width(0, 80);
        let mut calls = 0;
        assert!(wb.auto_fit_dimensions(0, range(0, 0, 10, 1), "column", 28, 120, |_, _, _| {
            calls += 1;
            Ok(if calls == 1 { 200.0 } else { invalid })
        }).is_err());
        assert_eq!(wb.sheet(0).unwrap().all_col_widths(), vec![(0, 80)]);
    }
}

#[test]
fn empty_sheet_resets_only_sparse_sizes_without_materializing_cells() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_row_height(100, 80);
    let atoms = wb.debug_total_atom_count(0);
    wb.auto_fit_dimensions(0, range(0, 0, 1_048_575, 16_383), "row", 28, 120, |_, _, _| {
        panic!("An empty sheet has no text to measure")
    }).unwrap();
    assert!(wb.sheet(0).unwrap().all_row_heights().is_empty());
    assert_eq!(wb.debug_total_atom_count(0), atoms);
}

#[test]
fn merges_across_the_axis_are_preserved_but_horizontal_merge_width_is_available_for_row_fit() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Merged text".into()));
    wb.sheet_mut(0).unwrap().restore_merged_ranges(vec![range(0, 0, 0, 1)]).unwrap();
    wb.sheet_mut(0).unwrap().set_col_width(0, 180);
    wb.auto_fit_dimensions(0, range(0, 0, 99, 1), "column", 28, 120, |_, _, _| panic!("spanning columns")).unwrap();
    assert_eq!(wb.sheet(0).unwrap().col_width(0), Some(180));
    wb.auto_fit_dimensions(0, range(0, 0, 0, 7), "row", 28, 120, |_, _, width| {
        assert_eq!(width, 300.0);
        Ok(70.0)
    }).unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(0), Some(70));
}
