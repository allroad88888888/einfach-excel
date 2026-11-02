use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};

#[test]
fn tracing_three_dimensional_reference_includes_every_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(1, "A1", Value::Number(20.0));
    assert!(wb.set_formula(0, "B1", "=SUM(Sheet1:Sheet2!A1)"));
    let refs = wb.trace_precedents(0, CellAddress::new(0, 1));
    assert_eq!(refs.len(), 2);
    assert!(refs
        .iter()
        .any(|r| r.sheet_index == 0 && r.range.start == CellAddress::new(0, 0)));
    assert!(refs
        .iter()
        .any(|r| r.sheet_index == 1 && r.range.start == CellAddress::new(0, 0)));
}

#[test]
fn tracing_qualified_named_formula_reaches_its_scoped_cells() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.set_cell(1, "A1", Value::Number(20.0));
    wb.define_named_formula("Total", Some(1), "=$A$1*2")
        .unwrap();
    assert!(wb.set_formula(0, "B1", "=sheet2!Total"));
    let refs = wb.trace_precedents(0, CellAddress::new(0, 1));
    assert_eq!(refs.len(), 1);
    assert_eq!(refs[0].sheet_index, 1);
    assert_eq!(refs[0].range.start, CellAddress::new(0, 0));
}
