use einfach_core::{Value, ValueError};
use einfach_excel_core::{CalculationMode, IterativeConfig, Workbook};

fn assert_approx_eq(actual: Value, expected: f64, eps: f64) {
    match actual {
        Value::Number(n) => assert!(
            (n - expected).abs() <= eps,
            "expected {expected} ± {eps}, got {n}"
        ),
        other => panic!("expected Value::Number({expected}), got {other:?}"),
    }
}

#[test]
fn iterative_config_defaults_and_clamping() {
    let wb = Workbook::new();
    assert_eq!(
        wb.iterative_calculation(),
        IterativeConfig {
            enabled: false,
            max_iterations: 100,
            max_change: 0.001,
        }
    );

    let normalized = IterativeConfig {
        enabled: true,
        max_iterations: 0,
        max_change: -5.0,
    }
    .normalized();
    assert_eq!(normalized.max_iterations, 1);
    assert_eq!(normalized.max_change, 0.0);

    let normalized_high = IterativeConfig {
        enabled: true,
        max_iterations: 99_999,
        max_change: f64::NAN,
    }
    .normalized();
    assert_eq!(normalized_high.max_iterations, 32_767);
    assert_eq!(normalized_high.max_change, 0.0);
}

#[test]
fn self_referential_counter_and_conditional_convergence() {
    let mut wb = Workbook::new();
    assert!(wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 25,
        max_change: 0.001,
    }));

    // Unbounded counter runs all `max_iterations` steps starting from 0.
    wb.set_cell_input(0, "A1", "=A1+1").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(25.0));

    // Conditional self-reference stops early once delta <= max_change.
    wb.set_cell_input(0, "A2", "=IF(A2<10, A2+1, A2)").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(10.0));
}

#[test]
fn multi_cell_cycle_converges_and_toggling_restores_cycle_error() {
    let mut wb = Workbook::new();

    // Enter cycle BEFORE enabling iterative calculation via set_formula.
    assert!(wb.set_formula(0, "A1", "=B1*0.5"));
    assert!(!wb.set_formula(0, "B1", "=100-A1"));
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::CyclicRef)
    );

    // Enable iterative calculation -> immediately converges to 100/3 and 200/3.
    assert!(wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 0.0001,
    }));
    assert_approx_eq(wb.get_cell("Sheet1", "A1"), 100.0 / 3.0, 0.001);
    assert_approx_eq(wb.get_cell("Sheet1", "B1"), 200.0 / 3.0, 0.001);
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B1").as_deref(),
        Some("=100-A1")
    );

    // Disable iterative calculation -> reverts to #CYCLE! while retaining formula text.
    assert!(wb.set_iterative_calculation(IterativeConfig {
        enabled: false,
        max_iterations: 100,
        max_change: 0.0001,
    }));
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::CyclicRef)
    );
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B1").as_deref(),
        Some("=100-A1")
    );

    // Re-enable iterative calculation -> converges again.
    assert!(wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 0.0001,
    }));
    assert_approx_eq(wb.get_cell("Sheet1", "A1"), 100.0 / 3.0, 0.001);
    assert_approx_eq(wb.get_cell("Sheet1", "B1"), 200.0 / 3.0, 0.001);
}

#[test]
fn cross_sheet_cycle_converges_and_reacts_to_upstream_input() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 0.0001,
    });

    wb.set_cell_input(0, "C1", "100").unwrap();
    wb.set_cell_input(0, "A1", "=Sheet2!A1*0.5").unwrap();
    wb.set_cell_input(1, "A1", "=Sheet1!C1-Sheet1!A1").unwrap();

    assert_approx_eq(wb.get_cell("Sheet1", "A1"), 100.0 / 3.0, 0.001);
    assert_approx_eq(wb.get_cell("Sheet2", "A1"), 200.0 / 3.0, 0.001);

    // Changing upstream cell C1 from 100 to 300 re-converges the cross-sheet cycle.
    wb.set_cell_input(0, "C1", "300").unwrap();
    assert_approx_eq(wb.get_cell("Sheet1", "A1"), 100.0, 0.001);
    assert_approx_eq(wb.get_cell("Sheet2", "A1"), 200.0, 0.001);
}

#[test]
fn max_change_tolerance_stops_iteration_early() {
    let mut wb = Workbook::new();
    // Coarse tolerance (max_change = 10.0) stops early before full convergence.
    wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 10.0,
    });
    wb.set_cell_input(0, "A1", "=B1*0.5").unwrap();
    wb.set_cell_input(0, "B1", "=100-A1").unwrap();

    let coarse_a1 = match wb.get_cell("Sheet1", "A1") {
        Value::Number(n) => n,
        other => panic!("expected number, got {other:?}"),
    };
    assert!((coarse_a1 - 100.0 / 3.0).abs() > 0.5);

    // Tightening max_change to 0.0001 immediately re-converges closer to 33.3333.
    wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 100,
        max_change: 0.0001,
    });
    assert_approx_eq(wb.get_cell("Sheet1", "A1"), 100.0 / 3.0, 0.001);
}

#[test]
fn manual_calculation_mode_f9_and_shift_f9_advance_iterations() {
    let mut wb = Workbook::new();
    wb.set_iterative_calculation(IterativeConfig {
        enabled: true,
        max_iterations: 5,
        max_change: 0.001,
    });
    wb.set_cell_input(0, "A1", "=IF(A1<12, A1+1, A1)").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(5.0));

    wb.set_calculation_mode(CalculationMode::Manual);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(5.0));

    // Shift+F9 on Sheet1 runs another 5-iteration pass: 5 -> 10.
    wb.recalculate(Some(0)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));

    // F9 on workbook runs another pass and converges at 12.
    wb.recalculate(None).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(12.0));
}
