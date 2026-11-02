use einfach_core::Value;
use einfach_excel_core::{IterativeConfig, Workbook};

fn iterative_workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 0.000001,
    });
    wb
}

fn assert_two(value: Value) {
    match value {
        Value::Number(n) => assert!((n - 2.0).abs() < 0.00001, "got {n}"),
        other => panic!("expected convergence to 2, got {other:?}"),
    }
}

#[test]
fn three_dimensional_reference_participates_in_iteration() {
    let mut wb = iterative_workbook();
    wb.set_cell_input(1, "A1", "2").unwrap();
    wb.set_cell_input(0, "A1", "=SUM(Sheet1:Sheet2!A1)*0.5")
        .unwrap();
    assert_two(wb.get_cell("Sheet1", "A1"));
}

#[test]
fn scoped_named_formula_participates_in_iteration() {
    let mut wb = iterative_workbook();
    wb.define_named_formula("Loop", Some(0), "=$A$1*0.5+1")
        .unwrap();
    wb.set_cell_input(0, "A1", "=Loop").unwrap();
    assert_two(wb.get_cell("Sheet1", "A1"));
}

#[test]
fn qualified_named_formula_resolves_sheet_case_insensitively_in_iteration() {
    let mut wb = iterative_workbook();
    wb.define_named_formula("Loop", Some(1), "=Sheet1!A1*0.5+1")
        .unwrap();
    wb.set_cell_input(0, "A1", "=sheet2!Loop").unwrap();
    assert_two(wb.get_cell("Sheet1", "A1"));
}
