//! Comprehensive tests for Sheet-Scoped Defined Names & Named Formulas (Item #27).

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Workbook};

#[test]
fn sheet_scoped_and_workbook_scoped_names_coexist_and_resolve_with_precedence() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sales Q1");

    // Same name in Workbook scope, Sheet1 scope, and Sheet2 scope simultaneously.
    wb.define_named_formula("TaxRate", None, "=0.05").unwrap();
    wb.define_named_formula("TaxRate", Some(0), "=0.10").unwrap();
    wb.define_named_formula("TaxRate", Some(s2), "=0.20").unwrap();

    // Unqualified TaxRate on Sheet1 -> 0.10 (Sheet1 scope)
    wb.set_formula(0, "A1", "=TaxRate*100");
    // Unqualified TaxRate on Sheet2 -> 0.20 (Sheet2 scope)
    wb.set_formula(s2, "A1", "=TaxRate*100");
    // Unqualified TaxRate on 'Sales Q1' -> falls back to Workbook scope (0.05)
    wb.set_formula(s3, "A1", "=TaxRate*100");

    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet2", "A1"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Sales Q1", "A1"), Value::Number(5.0));

    // Sheet-qualified references: Sheet1!TaxRate, Sheet2!TaxRate, 'Sales Q1'!TaxRate
    wb.set_formula(s3, "B1", "=Sheet1!TaxRate + Sheet2!TaxRate + 'Sales Q1'!TaxRate");
    assert_eq!(wb.get_cell("Sales Q1", "B1"), Value::Number(0.35000000000000003));
}

#[test]
fn sheet_scoped_named_ranges_and_sheet_qualified_range_references_work() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sales Q1");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(s2, "A1", Value::Number(100.0));
    wb.set_cell(s2, "A2", Value::Number(200.0));

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    wb.define_scoped_named_range("Items", None, 0, range).unwrap();
    wb.define_scoped_named_range("Items", Some(s2), s2, range).unwrap();

    // Unqualified Items on Sheet1 uses Workbook-scoped Items (30)
    wb.set_formula(0, "B1", "=SUM(Items)");
    // Unqualified Items on 'Sales Q1' uses 'Sales Q1'-scoped Items (300)
    wb.set_formula(s2, "B1", "=SUM(Items)");
    // Sheet-qualified 'Sales Q1'!Items on Sheet1 uses 'Sales Q1'-scoped Items (300)
    wb.set_formula(0, "B2", "=SUM('Sales Q1'!Items)");

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(30.0));
    assert_eq!(wb.get_cell("Sales Q1", "B1"), Value::Number(300.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(300.0));
}

#[test]
fn named_formulas_evaluate_dynamically_and_track_store_dependencies() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(0, "B1", Value::Number(5.0));

    wb.define_named_formula(" BoostedTotal ", None, "=SUM(Sheet1!$A$1:$A$2)*1.1")
        .unwrap_err(); // invalid name with spaces
    wb.define_named_formula("BoostedTotal", None, "=SUM(Sheet1!$A$1:$A$2)*1.5")
        .unwrap();
    wb.define_named_formula("LocalSum", Some(0), "=$A$1+$B$1")
        .unwrap();

    wb.set_formula(0, "C1", "=BoostedTotal");
    wb.set_formula(0, "C2", "=LocalSum*2");
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(45.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(30.0));

    // Mutate underlying cells: Named Formula dependents must reactively recompute!
    wb.set_cell(0, "A1", Value::Number(30.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(75.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(70.0));
}

#[test]
fn named_formulas_detect_cycles_with_cells_and_between_names() {
    let mut wb = Workbook::new();
    wb.define_named_formula("MirrorA1", None, "=Sheet1!$A$1+1")
        .unwrap();
    wb.set_formula(0, "A1", "=MirrorA1");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::CyclicRef));

    // Self-referential and mutually recursive named formulas surface #CYCLE!
    wb.define_named_formula("Ping", None, "=Pong+1").unwrap();
    wb.define_named_formula("Pong", None, "=Ping+1").unwrap();
    wb.set_formula(0, "B1", "=Ping");
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Error(ValueError::CyclicRef));
}
