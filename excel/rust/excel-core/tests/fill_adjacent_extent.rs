use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}

#[test]
fn adjacent_extent_prefers_left_and_stops_at_the_first_gap() {
    let mut wb = Workbook::new();
    for (addr, value) in [
        ("A1", 1.0),
        ("A2", 2.0),
        ("A3", 3.0),
        ("A5", 5.0),
        ("C1", 1.0),
        ("C2", 2.0),
        ("C3", 3.0),
        ("C4", 4.0),
    ] {
        wb.set_cell(0, addr, Value::Number(value));
    }
    assert_eq!(
        wb.find_fill_down_end(0, range("B1", "B1"), 100).unwrap(),
        Some(2)
    );
    assert_eq!(
        wb.find_fill_down_end(0, range("B1", "B1"), 2).unwrap(),
        Some(1)
    );
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
}

#[test]
fn first_column_falls_back_to_right_and_zero_false_and_formulas_are_not_blank() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B1", Value::Number(0.0));
    wb.set_cell(0, "B2", Value::Boolean(false));
    assert!(wb.set_formula(0, "B3", "=\"\""));
    wb.set_cell(0, "B5", Value::Number(5.0));
    assert_eq!(
        wb.find_fill_down_end(0, range("A1", "A1"), 100).unwrap(),
        Some(2)
    );
}

#[test]
fn absent_or_disconnected_adjacent_data_does_not_invent_a_target() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A4", Value::Number(4.0));
    assert_eq!(
        wb.find_fill_down_end(0, range("B1", "B2"), 100).unwrap(),
        None
    );
    wb.set_cell(0, "C2", Value::Number(2.0));
    wb.set_cell(0, "C3", Value::Number(3.0));
    assert_eq!(
        wb.find_fill_down_end(0, range("B1", "B2"), 100).unwrap(),
        None
    );
}

#[test]
fn extent_checks_source_and_row_limits_without_allocating_cell_atoms() {
    let wb = Workbook::new();
    let before = wb.sheet(0).unwrap().debug_materialized_cell_atom_count();
    for limit in [0, 1, 1_048_577] {
        assert!(wb.find_fill_down_end(0, range("B1", "B2"), limit).is_err());
    }
    assert!(wb.find_fill_down_end(1, range("A1", "A1"), 100).is_err());
    assert_eq!(
        wb.find_fill_down_end(0, range("B1", "B2"), 100).unwrap(),
        None
    );
    assert_eq!(
        wb.sheet(0).unwrap().debug_materialized_cell_atom_count(),
        before
    );
}
