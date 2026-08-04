//! Workbook topology tests.

use super::*;
use einfach_core::ValueError;

/// Steady-state reads through `wb.get_cell` reuse fresh derived atoms.
/// With no upstream mutation, the second read of A100 evaluates no formulas.
#[test]
fn chain_read_uses_cache_when_unchanged() {
    let mut wb = Workbook::new();
    // Build A1=1, A2=A1+1, ..., A100=A99+1 on Sheet1 (single sheet).
    wb.sheet_mut(0).unwrap().set_cell("A1", Value::Number(1.0));
    for i in 2..=100 {
        let addr = format!("A{i}");
        let src = format!("=A{}+1", i - 1);
        assert!(
            wb.set_formula(0, &addr, &src),
            "set_formula failed for {addr}={src}"
        );
    }
    // First read forces full chain eval.
    let v1 = wb.get_cell("Sheet1", "A100");
    let count1 = wb.debug_formula_eval_count(0);
    // Second read with no mutation MUST hit cache on every formula.
    let v2 = wb.get_cell("Sheet1", "A100");
    let count2 = wb.debug_formula_eval_count(0);
    assert_eq!(v1, v2);
    assert_eq!(v2, Value::Number(100.0), "A100 should be A1 + 99 = 100");
    assert_eq!(
        count2, count1,
        "steadyState read must not re-eval (cache miss bug); first={count1} second={count2}"
    );
}

/// Formulas installed through `sheet_mut` still use the workbook Store
/// context, so cross-sheet dependencies are captured by normal atom reads.
#[test]
fn raw_path_cross_sheet_formula_uses_shared_store() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    assert!(wb.sheet_mut(0).unwrap().set_formula("B1", "=Data!A1*2"));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(14.0));
}

/// Removing and recreating a referenced sheet updates the workbook
/// topology root, forcing dependent formula atoms to resolve the name again.
#[test]
fn remove_sheet_then_recompute_stays_correct() {
    let mut wb = Workbook::new();
    // Sheet1 hosts B1 = =Data!A1*2; Data is a second sheet.
    wb.add_sheet("Data"); // idx 1
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    assert!(wb.set_formula(0, "B1", "=Data!A1*2"));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));

    wb.remove_sheet(1);

    // A new Data sheet with the same name is resolved through the updated
    // topology version rather than any retained sheet index.
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(6.0));

    // Mutate the new source. Must propagate.
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(11.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(22.0));
}

#[test]
fn remove_sheet_shifts_indices() {
    let mut wb = Workbook::new();
    wb.add_sheet("B"); // idx 1
    wb.add_sheet("C"); // idx 2
    wb.remove_sheet(1);
    assert_eq!(wb.sheet_count(), 2);
    assert_eq!(wb.index_of("C"), Some(1)); // C shifted down
}

#[test]
fn move_sheet_updates_order_and_name_lookup() {
    let mut wb = Workbook::new();
    wb.add_sheet("B");
    wb.add_sheet("C");

    assert!(wb.move_sheet(2, 0));

    assert_eq!(wb.sheet_count(), 3);
    assert_eq!(wb.name(0), Some("C"));
    assert_eq!(wb.name(1), Some("Sheet1"));
    assert_eq!(wb.name(2), Some("B"));
    assert_eq!(wb.index_of("C"), Some(0));
    assert_eq!(wb.index_of("Sheet1"), Some(1));
    assert_eq!(wb.index_of("B"), Some(2));
    assert!(!wb.move_sheet(3, 0));
    assert!(!wb.move_sheet(0, 3));
}

#[test]
fn move_sheet_preserves_cross_sheet_chain_store_propagation() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");

    wb.set_cell(0, "B4", Value::Number(10.0));
    assert!(wb.set_formula(2, "C2", "=Sheet1!B4+1"));
    assert!(wb.set_formula(1, "C2", "=Sheet3!C2+1"));
    assert!(wb.set_formula(0, "C2", "=Sheet2!C2+1"));

    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(13.0));
    assert!(wb.move_sheet(2, 0));

    assert_eq!(wb.name(0), Some("Sheet3"));
    assert_eq!(wb.name(1), Some("Sheet1"));
    assert_eq!(wb.name(2), Some("Sheet2"));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(13.0));

    let sheet1 = wb.index_of("Sheet1").unwrap();
    let sheet2 = wb.index_of("Sheet2").unwrap();
    let sheet3 = wb.index_of("Sheet3").unwrap();
    assert_eq!(sheet1, 1);
    assert_eq!(sheet2, 2);
    assert_eq!(sheet3, 0);

    assert_eq!(wb.debug_formula_cache_state(sheet1, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(sheet2, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(sheet3, "C2"), "clean");
    let sheet1_evals = wb.debug_formula_eval_count(sheet1);
    let sheet2_evals = wb.debug_formula_eval_count(sheet2);
    let sheet3_evals = wb.debug_formula_eval_count(sheet3);

    wb.set_cell(sheet1, "B4", Value::Number(20.0));

    assert_eq!(wb.debug_formula_cache_state(sheet3, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(sheet2, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(sheet1, "C2"), "clean");
    assert_eq!(wb.debug_formula_eval_count(sheet1), sheet1_evals + 1);
    assert_eq!(wb.debug_formula_eval_count(sheet2), sheet2_evals + 1);
    assert_eq!(wb.debug_formula_eval_count(sheet3), sheet3_evals + 1);
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(23.0));
}

#[test]
fn move_sheet_retargets_cross_sheet_range_store_path() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.set_cell(1, "A1", Value::Number(1.0));
    wb.set_cell(1, "A2", Value::Number(2.0));
    assert!(wb.set_formula(0, "B1", "=SUM(Data!A1:A2)"));

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert!(wb.move_sheet(1, 0));

    let data = wb.index_of("Data").unwrap();
    let sheet1 = wb.index_of("Sheet1").unwrap();
    let before = wb.debug_formula_eval_count(sheet1);
    wb.set_cell(data, "A1", Value::Number(10.0));

    assert_eq!(wb.debug_formula_cache_state(sheet1, "B1"), "clean");
    assert_eq!(wb.debug_formula_eval_count(sheet1), before + 1);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(12.0));
}

// === Cross-sheet cycle detection (TODO 3.9) ===

#[test]
fn cross_sheet_two_way_cycle_detected() {
    // Sheet1.A1 = =Sheet2!A1
    // Sheet2.A1 = =Sheet1!A1
    // The first install is fine (Sheet2.A1 still empty). The second one
    // closes a cycle and must return false + write #CYCLE!.
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let s1 = wb.index_of("Sheet1").unwrap();
    let s2 = wb.index_of("Sheet2").unwrap();

    assert!(wb.set_formula(s1, "A1", "=Sheet2!A1"));
    // This should detect the cycle.
    assert!(
        !wb.set_formula(s2, "A1", "=Sheet1!A1"),
        "second set_formula closes cycle, must return false"
    );

    assert_eq!(
        wb.get_cell("Sheet2", "A1"),
        Value::Error(ValueError::CyclicRef),
        "Sheet2.A1 should hold #CYCLE!"
    );
}

#[test]
fn cross_sheet_three_way_cycle_detected() {
    // Sheet1.A1 = =Sheet2!A1 → Sheet2.A1 = =Sheet3!A1 → Sheet3.A1 = =Sheet1!A1
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");
    let s1 = wb.index_of("Sheet1").unwrap();
    let s2 = wb.index_of("Sheet2").unwrap();
    let s3 = wb.index_of("Sheet3").unwrap();

    assert!(wb.set_formula(s1, "A1", "=Sheet2!A1"));
    assert!(wb.set_formula(s2, "A1", "=Sheet3!A1"));
    // Closing edge:
    assert!(
        !wb.set_formula(s3, "A1", "=Sheet1!A1"),
        "three-way cycle must be detected on the closing edge"
    );

    assert_eq!(
        wb.get_cell("Sheet3", "A1"),
        Value::Error(ValueError::CyclicRef),
    );
}

#[test]
fn cross_sheet_chain_no_cycle() {
    // Sheet1.A1 = =Sheet2!A1, Sheet2.A1 = =Sheet3!A1, Sheet3.A1 = 5
    // No cycle: every set_formula succeeds, values resolve.
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");
    let s1 = wb.index_of("Sheet1").unwrap();
    let s2 = wb.index_of("Sheet2").unwrap();
    let s3 = wb.index_of("Sheet3").unwrap();

    wb.sheet_mut(s3).unwrap().set_cell("A1", Value::Number(5.0));
    assert!(wb.set_formula(s2, "A1", "=Sheet3!A1"));
    assert!(wb.set_formula(s1, "A1", "=Sheet2!A1"));

    assert_eq!(wb.get_cell("Sheet3", "A1"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet2", "A1"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(5.0));
}

#[test]
fn cross_sheet_self_ref_via_sheet_name() {
    // Sheet1.A1 = =Sheet1!A1 — same as a same-sheet self-ref. Workbook
    // static check should also catch it (target_idx == sheet_idx, target
    // == addr → cycle on the seed itself).
    let mut wb = Workbook::new();
    let s1 = wb.index_of("Sheet1").unwrap();

    assert!(
        !wb.set_formula(s1, "A1", "=Sheet1!A1"),
        "self-reference via own sheet name must be detected"
    );
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::CyclicRef),
    );
}
