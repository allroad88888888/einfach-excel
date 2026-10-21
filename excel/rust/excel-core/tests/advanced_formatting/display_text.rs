use super::*;
use einfach_excel_core::{CellFormat, CellStyle, NumberFormat, StyleScope};

fn format(book: &mut Workbook, address: &str, number_format: NumberFormat) {
    book.sheet_mut(0).unwrap().set_format(address, CellFormat { number_format, ..Default::default() });
}

#[test]
fn display_comparison_unifies_types_and_honors_percent_dates_rounding_and_blank_policy() {
    let mut book = Workbook::new();
    for (address, value) in [
        ("A1", Value::Number(1.0)), ("A2", Value::Text("1".into())),
        ("A3", Value::Number(0.5)), ("A4", Value::Text("50%".into())),
        ("A5", Value::Number(1.04)), ("A6", Value::Number(1.03)),
        ("A7", Value::Number(1.0)), ("A8", Value::Text("1900-01-01".into())),
        ("A9", Value::Boolean(true)), ("A10", Value::Text("true".into())),
        ("A11", Value::Text("".into())), ("A12", Value::Number(f64::INFINITY)),
    ] { book.set_cell(0, address, value); }
    book.set_formula(0, "A13", "=1/0");
    book.set_formula(0, "A14", "=\"\"");
    format(&mut book, "A3", NumberFormat::Percent { digits: 0 });
    for address in ["A5", "A6"] { format(&mut book, address, NumberFormat::Decimal { digits: 1, thousands: false }); }
    format(&mut book, "A7", NumberFormat::Date("yyyy-mm-dd".into()));
    install(&mut book, display("duplicate"));
    for row in 1..=15 { assert_eq!(bold(&book, &format!("A{row}")), row <= 10, "row {row}"); }
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("1".into()));
    install(&mut book, json!({"kind":"duplicate-values","mode":"duplicate","format":{"bold":true}}));
    assert!(bold(&book, "A1")); assert!(bold(&book, "A7"));
    for row in [2, 3, 4, 5, 6, 8, 9, 10] { assert!(!bold(&book, &format!("A{row}"))); }
}

#[test]
fn same_value_different_display_is_unique_and_format_edits_refresh_offscreen_counts() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0));
    book.set_cell(0, "A900000", Value::Number(1.0));
    install(&mut book, display("duplicate"));
    assert!(bold(&book, "A1"));
    format(&mut book, "A900000", NumberFormat::Percent { digits: 0 });
    assert!(!bold(&book, "A1"));
    install(&mut book, display("unique")); assert!(bold(&book, "A1"));
    format(&mut book, "A900000", NumberFormat::General);
    assert!(!bold(&book, "A1"));
    let before = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..10 { assert!(!bold(&book, "A1")); }
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
}

#[test]
fn row_and_column_number_formats_use_existing_priority_without_materializing_the_grid() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(0.5));
    book.set_cell(0, "A900000", Value::Text("50%".into()));
    install(&mut book, display("duplicate")); assert!(!bold(&book, "A1"));
    book.sheet_mut(0).unwrap().patch_format_range(range("A1", "A1"), StyleScope::Column,
        CellStyle { number_format: Some(NumberFormat::Percent { digits: 0 }), ..Default::default() });
    assert!(bold(&book, "A1"));
    book.sheet_mut(0).unwrap().patch_format_range(range("A1", "A1"), StyleScope::Row,
        CellStyle { number_format: Some(NumberFormat::General), ..Default::default() });
    assert!(!bold(&book, "A1"));
    assert_eq!(book.sheet(0).unwrap().debug_primitive_atom_count(), 2);
}

#[test]
fn formula_spills_disjoint_ranges_and_non_display_styles_keep_original_values() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(2,1,1.01,0.02)");
    book.set_cell(0, "C1", Value::Text("1.0".into()));
    for addr in ["A1", "A2"] { format(&mut book, addr, NumberFormat::Decimal { digits: 1, thousands: false }); }
    let mut rule = entry(display("duplicate")); rule.row_end = 1;
    rule.additional_ranges = vec![range("C1", "C1")];
    WorkbookHistory::default().set_conditional_format_rule(&mut book, 0, 0, rule).unwrap();
    for addr in ["A1", "A2", "C1"] { assert!(bold(&book, addr)); }
    book.set_cell(0, "B1", Value::Text("Neighbor".into()));
    assert!(!bold(&book, "B1"));
    assert_eq!(book.sheet(0).unwrap().get_format("A1").bold, false);
    book.sheet_mut(0).unwrap().patch_format_range(range("A1", "A1"), StyleScope::Cell,
        CellStyle { color: Some(Some("#ff0000".into())), ..Default::default() });
    assert!(bold(&book, "A1"));
}
