use einfach_core::Value;
use einfach_excel_core::data_validation::{
    AdvancedValidationOptions, DataValidationKind, DataValidationOperator, DataValidationRule,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn set_rule(wb: &mut Workbook, sheet: usize, range: CellRange, r: DataValidationRule) {
    let mut history = WorkbookHistory::default();
    history.set_data_validation(wb, sheet, range, Some(r)).unwrap();
}

fn rule(kind: DataValidationKind, ignore_blank: bool) -> DataValidationRule {
    DataValidationRule {
        kind,
        ignore_blank,
        operator: DataValidationOperator::Between,
        options: AdvancedValidationOptions::default(),
    }
}

#[test]
fn circles_preexisting_invalid_values_and_skips_blanks_even_on_whole_column() {
    let mut wb = Workbook::new();
    // Whole-column rule A1:A1048576: whole numbers between 10 and 20, ignore_blank=false.
    let whole_col = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_575, 0));
    wb.set_cell(0, "A1", Value::Number(15.0));
    wb.set_cell(0, "A2", Value::Number(25.0)); // invalid
    wb.set_cell(0, "A3", Value::Text("oops".into())); // invalid
    wb.set_cell(0, "A100", Value::Number(5.0)); // invalid
    set_rule(
        &mut wb,
        0,
        whole_col,
        rule(
            DataValidationKind::WholeNumber { min: 10.0, max: 20.0 },
            false,
        ),
    );

    // List rule on B1:B3
    wb.set_cell(0, "B1", Value::Text("Open".into()));
    wb.set_cell(0, "B2", Value::Text("Stale".into())); // invalid
    set_rule(
        &mut wb,
        0,
        CellRange::new(CellAddress::new(0, 1), CellAddress::new(2, 1)),
        rule(
            DataValidationKind::List {
                items: vec!["Open".into(), "Closed".into()],
            },
            true,
        ),
    );

    let report = wb.list_invalid_validation_cells(0, 255).unwrap();
    assert!(!report.truncated);
    let coords: Vec<(u32, u32)> = report.cells.iter().map(|c| (c.row, c.col)).collect();
    // Deterministic row-major order: A2 (1,0), B2 (1,1), A3 (2,0), A100 (99,0); blank cells skipped!
    assert_eq!(coords, vec![(1, 0), (1, 1), (2, 0), (99, 0)]);
}

#[test]
fn custom_formula_and_formula_results_update_invalid_circles_dynamically() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(30.0));
    wb.set_cell(0, "B1", Value::Number(20.0));
    wb.set_cell(0, "B2", Value::Number(20.0));
    // Custom formula on A1:A2: cell must be <= B1 (relative)
    set_rule(
        &mut wb,
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
        rule(
            DataValidationKind::CustomFormula {
                formula: "=A1<=B1".into(),
                anchor: CellAddress::new(0, 0),
            },
            true,
        ),
    );

    // Formula cell on C1 returning empty string under ignore_blank=false vs C2 returning 50
    wb.set_formula(0, "C1", "=IF(TRUE,\"\",1)");
    wb.set_formula(0, "C2", "=A1+A2"); // 40 (valid for 0..50)
    set_rule(
        &mut wb,
        0,
        CellRange::new(CellAddress::new(0, 2), CellAddress::new(1, 2)),
        rule(
            DataValidationKind::Decimal { min: 0.0, max: 50.0 },
            false,
        ),
    );

    let first = wb.list_invalid_validation_cells(0, 255).unwrap();
    let coords: Vec<(u32, u32)> = first.cells.iter().map(|c| (c.row, c.col)).collect();
    // C1 evaluates to "" with ignore_blank=false -> invalid; A2=30 > B2=20 -> invalid
    assert_eq!(coords, vec![(0, 2), (1, 0)]);

    // Update B2 to 50 so A2 becomes valid, and A1 to 25 so C2=55 becomes invalid and A1>B1 becomes invalid
    wb.set_cell(0, "B2", Value::Number(50.0));
    wb.set_cell(0, "A1", Value::Number(25.0));
    let second = wb.list_invalid_validation_cells(0, 255).unwrap();
    let coords2: Vec<(u32, u32)> = second.cells.iter().map(|c| (c.row, c.col)).collect();
    assert_eq!(coords2, vec![(0, 0), (0, 2), (1, 2)]);
}

#[test]
fn invalid_circle_scan_respects_max_count_and_reports_truncation() {
    let mut wb = Workbook::new();
    for r in 0..10u32 {
        wb.set_cell(0, &format!("A{}", r + 1), Value::Number(100.0 + r as f64));
    }
    set_rule(
        &mut wb,
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(9, 0)),
        rule(
            DataValidationKind::WholeNumber { min: 1.0, max: 10.0 },
            true,
        ),
    );

    let bounded = wb.list_invalid_validation_cells(0, 3).unwrap();
    assert!(bounded.truncated);
    assert_eq!(bounded.cells.len(), 3);
    assert_eq!(bounded.cells[0].row, 0);
    assert_eq!(bounded.cells[2].row, 2);
}
