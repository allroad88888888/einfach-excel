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
