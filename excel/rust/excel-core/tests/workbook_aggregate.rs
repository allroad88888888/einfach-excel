use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn complete_sparse_column_counts_only_finite_numbers_including_zero() {
    let mut wb = Workbook::new();
    for (address, value) in [
        ("A1", Value::Number(10.0)),
        ("A2", Value::Text("20".into())),
        ("A3", Value::Boolean(true)),
        ("A4", Value::Number(0.0)),
        ("A5", Value::Number(f64::INFINITY)),
        ("A1000000", Value::Number(-4.0)),
        ("B1", Value::Number(999.0)),
    ] {
        wb.set_cell(0, address, value);
    }
    let atoms = wb.debug_total_atom_count(0);
    let result = wb
        .aggregate_selection(&[(0, range("A1", "A1048576"))])
        .unwrap();
    assert_eq!(result.numeric_count, 3);
    assert_eq!(result.count, 6);
    assert_eq!((result.min, result.max), (Some(-4.0), Some(10.0)));
    assert_eq!(result.sum, Some(6.0));
    assert_eq!(result.average, Some(2.0));
    assert_eq!(wb.debug_total_atom_count(0), atoms);
}

#[test]
fn overlapping_ranges_and_repeated_targets_count_each_cell_once() {
    let mut wb = Workbook::new();
    for (address, value) in [("A1", 1.0), ("A2", 2.0), ("A3", 3.0), ("B1", 999.0)] {
        wb.set_cell(0, address, Value::Number(value));
    }
    let targets = [
        (0, range("A1", "A2")),
        (0, range("A2", "A3")),
        (0, range("A1", "A2")),
    ];
    assert_eq!(wb.aggregate_selection(&targets).unwrap().numeric_count, 3);
    assert_eq!(wb.aggregate_selection(&targets).unwrap().count, 3);
    assert_eq!(wb.aggregate_selection(&targets).unwrap().sum, Some(6.0));
}

#[test]
fn formulas_use_workbook_context_and_recompute_after_source_changes() {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    wb.set_cell(0, "A1", Value::Number(3.0));
    assert!(wb.set_formula(1, "A1", "=Sheet1!A1*2"));
    assert!(wb.set_formula(1, "A2", "=1/0"));
    let targets = [(0, range("A1", "A1")), (1, range("A1", "A2"))];
    assert_eq!(wb.aggregate_selection(&targets).unwrap().sum, Some(9.0));
    wb.set_cell(0, "A1", Value::Number(5.0));
    let result = wb.aggregate_selection(&targets).unwrap();
    assert_eq!(result.numeric_count, 2);
    assert_eq!(result.count, 3);
    assert_eq!((result.min, result.max), (Some(5.0), Some(10.0)));
    assert_eq!(result.sum, Some(15.0));
}

#[test]
fn empty_selection_values_have_no_average_or_sum() {
    let wb = Workbook::new();
    let result = wb
        .aggregate_selection(&[(0, range("A1", "Z1000"))])
        .unwrap();
    assert_eq!(result.numeric_count, 0);
    assert_eq!(result.count, 0);
    assert_eq!((result.min, result.max), (None, None));
    assert_eq!(result.sum, None);
    assert_eq!(result.average, None);
}

#[test]
fn overflow_is_explicit_but_finite_average_and_cancellation_are_preserved() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(f64::MAX));
    wb.set_cell(0, "A2", Value::Number(f64::MAX));
    let result = wb.aggregate_selection(&[(0, range("A1", "A2"))]).unwrap();
    assert_eq!(result.sum, None);
    assert_eq!(result.average, Some(f64::MAX));
    assert_eq!((result.min, result.max), (Some(f64::MAX), Some(f64::MAX)));
    for (address, value) in [("A1", 1e16), ("A2", 1.0), ("A3", -1e16)] {
        wb.set_cell(0, address, Value::Number(value));
    }
    assert_eq!(
        wb.aggregate_selection(&[(0, range("A1", "A3"))])
            .unwrap()
            .sum,
        Some(1.0)
    );
}

#[test]
fn invalid_ranges_fail_instead_of_returning_partial_statistics() {
    let wb = Workbook::new();
    assert!(wb.aggregate_selection(&[]).is_err());
    for target in [
        (9, range("A1", "A2")),
        (0, range("A3", "A1")),
        (
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_576, 0)),
        ),
    ] {
        assert!(wb.aggregate_selection(&[target]).is_err());
    }
    assert!(wb
        .aggregate_selection(&vec![(0, range("A1", "A1")); 1025])
        .is_err());
}

#[test]
fn selected_spill_children_and_hidden_rows_are_numeric_values() {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "A1", "=SEQUENCE(3)"));
    assert!(wb.hide_rows(0, &[1]));
    let result = wb.aggregate_selection(&[(0, range("A1", "A3"))]).unwrap();
    assert_eq!(result.numeric_count, 3);
    assert_eq!(result.sum, Some(6.0));
    let child = wb.aggregate_selection(&[(0, range("A2", "A3"))]).unwrap();
    assert_eq!(child.numeric_count, 2);
    assert_eq!(child.count, 2);
    assert_eq!((child.min, child.max), (Some(2.0), Some(3.0)));
    assert_eq!(child.sum, Some(5.0));
}

#[test]
fn non_empty_count_includes_empty_strings_booleans_errors_but_not_real_blanks() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("".into()));
    assert!(wb.set_formula(0, "A2", "=\"\""));
    assert!(wb.set_formula(0, "A3", "=1/0"));
    wb.set_cell(0, "A4", Value::Boolean(false));
    wb.set_cell(0, "A5", Value::Text("10".into()));
    wb.set_cell(0, "A6", Value::Number(0.0));
    wb.set_cell(0, "A7", Value::Null);
    let result = wb
        .aggregate_selection(&[(0, range("A1", "A1000000"))])
        .unwrap();
    assert_eq!(result.count, 6);
    assert_eq!(result.numeric_count, 1);
    assert_eq!((result.min, result.max), (Some(0.0), Some(0.0)));
    let text = wb.aggregate_selection(&[(0, range("A1", "A5"))]).unwrap();
    assert_eq!(text.count, 5);
    assert_eq!((text.min, text.max), (None, None));
}

#[test]
fn extrema_are_not_biased_toward_zero_or_coerced_from_non_numeric_values() {
    for (a, b, min, max) in [
        (3.0, 8.0, 3.0, 8.0),
        (-3.0, -8.0, -8.0, -3.0),
        (0.0, 0.0, 0.0, 0.0),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(a));
        wb.set_cell(0, "A2", Value::Number(b));
        wb.set_cell(0, "A3", Value::Text("-99999".into()));
        wb.set_cell(0, "A4", Value::Boolean(true));
        let result = wb.aggregate_selection(&[(0, range("A1", "A4"))]).unwrap();
        assert_eq!(result.count, 4);
        assert_eq!(result.numeric_count, 2);
        assert_eq!((result.min, result.max), (Some(min), Some(max)));
    }
}

#[test]
fn merged_range_counts_its_anchor_once_and_clearing_an_extreme_updates_the_result() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(99.0));
    wb.set_cell(0, "B1", Value::Number(-2.0));
    wb.merge_cells(
        0,
        range("A1", "A3"),
        einfach_excel_core::MergeAction::Merge,
        true,
    )
    .unwrap();
    let targets = [(0, range("A1", "B3")), (0, range("A1", "A3"))];
    let merged = wb.aggregate_selection(&targets).unwrap();
    assert_eq!(merged.count, 2);
    assert_eq!((merged.min, merged.max), (Some(-2.0), Some(10.0)));
    wb.clear_cell(0, "A1");
    let cleared = wb.aggregate_selection(&targets).unwrap();
    assert_eq!(cleared.count, 1);
    assert_eq!((cleared.min, cleared.max), (Some(-2.0), Some(-2.0)));
}
