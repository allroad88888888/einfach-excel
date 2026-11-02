use einfach_core::Value;
use einfach_excel_core::{
    AuditingRef, CellAddress, CellRange, Workbook,
};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("valid cell address")
}

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end)).normalize()
}

#[test]
fn trace_precedents_resolves_same_sheet_cross_sheet_named_ranges_and_tables() {
    let mut wb = Workbook::new();
    let sheet2 = wb.add_sheet("Sheet2");
    assert_eq!(sheet2, 1);

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(0, "B1", Value::Number(5.0));
    wb.set_cell(1, "C1", Value::Number(100.0));
    wb.set_cell(1, "D1", Value::Number(1.0));
    wb.set_cell(1, "D2", Value::Number(2.0));

    wb.define_named_range("CrossBonus", 1, range("D1", "D2"))
        .expect("define named range");

    wb.set_cell(0, "F1", Value::Text("Amount".into()));
    wb.set_cell(0, "F2", Value::Number(7.0));
    wb.set_cell(0, "F3", Value::Number(8.0));
    wb.define_table(Some("Orders"), 0, range("F1", "F3"), true)
        .expect("register table");

    assert!(wb.set_formula(
        0,
        "E1",
        "=SUM(A1:A2) + B1 + Sheet2!C1 + SUM(CrossBonus) + SUM(Orders[Amount])"
    ));

    let precedents = wb.trace_precedents(0, addr("E1"));
    assert_eq!(
        precedents,
        vec![
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("A1", "A2"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("B1", "B1"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 1,
                sheet_name: "Sheet2".into(),
                range: range("C1", "C1"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 1,
                sheet_name: "Sheet2".into(),
                range: range("D1", "D2"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("F2", "F3"),
                is_error: false,
            },
        ]
    );
}

#[test]
fn trace_dependents_finds_direct_range_named_spill_and_error_edges() {
    let mut wb = Workbook::new();
    wb.add_sheet("Summary");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.define_named_range("Inputs", 0, range("A1", "A2"))
        .expect("define named range");

    assert!(wb.set_formula(0, "B1", "=A1 * 2"));
    assert!(wb.set_formula(0, "B2", "=SUM(A1:A2)"));
    assert!(wb.set_formula(1, "C1", "=SUM(Inputs)"));

    let dependents = wb.trace_dependents(0, addr("A1"));
    assert_eq!(
        dependents,
        vec![
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("B1", "B1"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("B2", "B2"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 1,
                sheet_name: "Summary".into(),
                range: range("C1", "C1"),
                is_error: false,
            },
        ]
    );

    // Spill anchor dependents: D1 spills into D1:D3, E1 references D2, E2 references D1#.
    assert!(wb.set_formula(0, "D1", "=SEQUENCE(3)"));
    let _ = wb.get_cell("Sheet1", "D1");
    assert!(wb.set_formula(0, "E1", "=D2 + 1"));
    assert!(wb.set_formula(0, "E2", "=SUM(D1#)"));

    let spill_deps = wb.trace_dependents(0, addr("D1"));
    assert_eq!(
        spill_deps,
        vec![
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("E1", "E1"),
                is_error: false,
            },
            AuditingRef {
                sheet_index: 0,
                sheet_name: "Sheet1".into(),
                range: range("E2", "E2"),
                is_error: false,
            },
        ]
    );

    // Error propagation marks is_error = true on trace edges.
    wb.set_cell(0, "G1", Value::Number(0.0));
    assert!(wb.set_formula(0, "G2", "=1 / G1"));
    let err_precs = wb.trace_precedents(0, addr("G2"));
    assert_eq!(err_precs.len(), 1);
    assert!(err_precs[0].is_error);
    let err_deps = wb.trace_dependents(0, addr("G1"));
    assert_eq!(err_deps.len(), 1);
    assert!(err_deps[0].is_error);
}

#[test]
fn evaluate_formula_steps_reduces_innermost_expressions_and_provides_step_in_targets() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    assert!(wb.set_formula(0, "B1", "=Sheet2!C3 + 5"));
    wb.set_cell(1, "C3", Value::Number(10.0));
    assert!(wb.set_formula(0, "C1", "=SUM(A1:A2) + B1 * 2"));

    let trace = wb.evaluate_formula_steps(0, addr("C1"));
    assert!(trace.is_formula);
    assert!(!trace.is_error);
    assert_eq!(trace.final_result, "60");
    assert_eq!(trace.steps.len(), 4);

    // Step 0: SUM(A1:A2) -> 30
    let s0 = &trace.steps[0];
    assert_eq!(s0.expression_before, "=SUM(A1:A2) + B1 * 2");
    assert_eq!(&s0.expression_before[s0.focus_span.0..s0.focus_span.1], "SUM(A1:A2)");
    assert_eq!(s0.step_result, "30");
    assert_eq!(s0.expression_after, "=30 + B1 * 2");
    assert_eq!(s0.step_in_target, None);

    // Step 1: B1 -> 15 (with step_in_target pointing to Sheet1!B1)
    let s1 = &trace.steps[1];
    assert_eq!(s1.expression_before, "=30 + B1 * 2");
    assert_eq!(&s1.expression_before[s1.focus_span.0..s1.focus_span.1], "B1");
    assert_eq!(s1.step_result, "15");
    assert_eq!(s1.expression_after, "=30 + 15 * 2");
    assert_eq!(
        s1.step_in_target,
        Some((0, "Sheet1".to_string(), addr("B1")))
    );

    // Step 2: 15 * 2 -> 30
    let s2 = &trace.steps[2];
    assert_eq!(s2.expression_before, "=30 + 15 * 2");
    assert_eq!(&s2.expression_before[s2.focus_span.0..s2.focus_span.1], "15 * 2");
    assert_eq!(s2.step_result, "30");
    assert_eq!(s2.expression_after, "=30 + 30");

    // Step 3: 30 + 30 -> 60
    let s3 = &trace.steps[3];
    assert_eq!(s3.expression_before, "=30 + 30");
    assert_eq!(&s3.expression_before[s3.focus_span.0..s3.focus_span.1], "30 + 30");
    assert_eq!(s3.step_result, "60");
    assert_eq!(s3.expression_after, "=60");

    // Stepping into B1 shows Sheet2!C3 as a cross-sheet step_in_target.
    let sub_trace = wb.evaluate_formula_steps(0, addr("B1"));
    assert_eq!(sub_trace.steps.len(), 2);
    assert_eq!(
        sub_trace.steps[0].step_in_target,
        Some((1, "Sheet2".to_string(), addr("C3")))
    );
}

#[test]
fn inspect_watched_cells_reads_values_formulas_and_defined_names_across_sheets() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");

    wb.set_cell(0, "A1", Value::Number(42.0));
    wb.define_named_range("TaxRate", 0, range("A1", "A1"))
        .expect("define single-cell named range");
    assert!(wb.set_formula(1, "B5", "=Sheet1!A1 * 2"));

    let snapshots = wb.inspect_watched_cells(&[(0, addr("A1")), (1, addr("B5"))]);
    assert_eq!(snapshots.len(), 2);
    assert_eq!(snapshots[0].sheet_name, "Sheet1");
    assert_eq!(snapshots[0].addr, addr("A1"));
    assert_eq!(snapshots[0].name.as_deref(), Some("TaxRate"));
    assert_eq!(snapshots[0].value, "42");
    assert_eq!(snapshots[0].formula, "");

    assert_eq!(snapshots[1].sheet_name, "Sheet2");
    assert_eq!(snapshots[1].addr, addr("B5"));
    assert_eq!(snapshots[1].name, None);
    assert_eq!(snapshots[1].value, "84");
    assert_eq!(snapshots[1].formula, "=Sheet1!A1 * 2");
}
