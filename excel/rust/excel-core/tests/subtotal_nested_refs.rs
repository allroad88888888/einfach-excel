use einfach_core::Value;
use einfach_excel_core::Workbook;

#[test]
fn nested_subtotal_sources_are_excluded_while_other_formulas_and_literals_still_count() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(4.0));
    assert!(book.set_formula(0, "A3", "=SUBTOTAL(9,A1:A2)"));
    assert!(book.set_formula(0, "A4", "=IF(TRUE,SUBTOTAL(9,A1:A2),0)"));
    assert!(book.set_formula(0, "A5", "=IF(TRUE,1,\"SUBTOTAL(\")"));
    assert!(book.set_formula(0, "A6", "=SUM(A1:A2)"));
    assert!(book.set_formula(0, "B1", "=SUBTOTAL(9,A1:A6)"));
    assert!(book.set_formula(0, "B2", "=SUBTOTAL(1,A1:A6)"));
    assert!(book.set_formula(0, "B3", "=AGGREGATE(9,4,A1:A6)"));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(6.0));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(6.0));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(13.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(3.25));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(25.0));
}

#[test]
fn changing_nested_formula_kind_recalculates_a_cross_sheet_outer_subtotal() {
    let mut book = Workbook::new();
    let data = book.add_sheet("Data points");
    book.set_cell(data, "A1", Value::Number(2.0));
    book.set_cell(data, "A2", Value::Number(4.0));
    assert!(book.set_formula(data, "A3", "=SUM(A1:A2)"));
    assert!(book.set_formula(0, "A1", "=SUBTOTAL(9,'Data points'!A1:A3)"));
    assert!(book.set_formula(0, "A2", "=SUBTOTAL(9,IF(TRUE,'Data points'!A1:A3,B1:B3))"));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(12.0));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(12.0));
    assert!(book.set_formula(data, "A3", "=SUBTOTAL(9,A1:A2)"));
    assert_eq!(book.get_cell("Data points", "A3"), Value::Number(6.0));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(6.0));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(6.0));
    assert!(book.set_formula(data, "A3", "=SUM(A1:A2)"));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(12.0));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(12.0));
}

#[test]
fn replacing_a_literal_with_a_same_value_subtotal_updates_its_outer_total() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(4.0));
    book.set_cell(0, "A3", Value::Number(6.0));
    assert!(book.set_formula(0, "B1", "=SUBTOTAL(9,A1:A3)"));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(12.0));
    assert!(book.set_formula(0, "A3", "=SUBTOTAL(9,A1:A2)"));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(6.0));
    book.set_cell(0, "A3", Value::Number(6.0));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(12.0));
}

#[test]
fn subtotal_3d_and_multi_area_respect_per_sheet_hidden_rows_and_skip_nested_subtotals() {
    let mut book = Workbook::new();
    let second = book.add_sheet("Sheet2");
    let summary = book.add_sheet("Summary");
    book.set_cell(0, "A1", Value::Number(10.0));
    book.set_cell(0, "A2", Value::Number(20.0));
    assert!(book.set_formula(0, "A3", "=SUBTOTAL(9,A1:A2)"));
    book.set_cell(second, "A1", Value::Number(100.0));
    book.set_cell(second, "A2", Value::Number(200.0));
    assert!(book.set_formula(second, "A3", "=SUBTOTAL(9,A1:A2)"));
    // Hide row 1 (A2) on Sheet1 only, and row 0 (A1) on Sheet2 only.
    book.set_eval_hidden_rows(0, &[1]);
    book.set_eval_hidden_rows(second, &[0]);
    assert!(book.set_formula(summary, "B1", "=SUBTOTAL(109,Sheet1:Sheet2!A1:A3)"));
    assert!(book.set_formula(summary, "B2", "=SUBTOTAL(109,Sheet1!A1:A3,Sheet2!A1:A3)"));
    // Sheet1 visible non-subtotal = A1 (10), Sheet2 visible non-subtotal = A2 (200) -> 210
    assert_eq!(book.get_cell("Summary", "B1"), Value::Number(210.0));
    assert_eq!(book.get_cell("Summary", "B2"), Value::Number(210.0));
}
