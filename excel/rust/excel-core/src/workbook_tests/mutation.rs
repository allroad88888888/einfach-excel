//! Workbook mutation tests.

use std::cell::RefCell;
use std::rc::Rc;

use super::*;
use einfach_core::ValueError;

#[test]
fn workbook_set_formula_invalid_sheet_returns_false() {
    let mut wb = Workbook::new();
    assert!(!wb.set_formula(99, "A1", "=1+1"));
}

#[test]
fn workbook_set_formula_parse_error_writes_value_error() {
    let mut wb = Workbook::new();
    let s1 = wb.index_of("Sheet1").unwrap();
    assert!(!wb.set_formula(s1, "A1", "=garbage(("));
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn workbook_debug_formula_eval_count_stays_zero_until_read() {
    let mut wb = Workbook::new();
    let data = wb.add_sheet("Data");
    wb.set_cell(data, "A1", Value::Number(41.0));
    assert!(wb.set_formula(0, "A1", "=Data!A1+1"));

    assert_eq!(wb.debug_formula_eval_count(0), 0);
    assert_eq!(wb.debug_formula_cache_state(0, "A1"), "dirty");

    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
    assert_eq!(wb.debug_formula_eval_count(0), 1);
    assert_eq!(wb.debug_formula_cache_state(0, "A1"), "clean");
}

#[test]
fn cross_sheet_runtime_guard_returns_cycle_when_static_bypassed() {
    // Build a cycle by going through Sheet::set_formula directly, which
    // does NOT have workbook-level cycle detection. Then read through
    // Workbook::get_cell. The workbook-scoped in-flight guard shared by
    // formula-inner atom reads must terminate recursive re-entry.
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    wb.sheet_mut(0).unwrap().set_formula("A1", "=Sheet2!A1");
    wb.sheet_by_name_mut("Sheet2")
        .unwrap()
        .set_formula("A1", "=Sheet1!A1");

    // Reading either side must terminate (no infinite loop) and not
    // return a stale propagated number; cycle/error/null are all
    // acceptable outcomes for this defensive scenario, the key is
    // termination + no stale numeric.
    let v = wb.get_cell("Sheet1", "A1");
    assert!(
        matches!(v, Value::Null | Value::Error(_)),
        "expected Null/Error from cycle, got {:?}",
        v
    );
}

#[test]
fn workbook_set_formula_happy_path_values_propagate() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();
    let sd = wb.index_of("Data").unwrap();
    wb.sheet_mut(sd).unwrap().set_cell("A1", Value::Number(7.0));
    assert!(wb.set_formula(s1, "B1", "=Data!A1*3"));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(21.0));
}

// === Workbook-scoped Store propagation acceptance ===

/// A workbook-routed source write publishes a changed materialized
/// cross-sheet formula through the shared Store dependency graph.
#[test]
fn cross_sheet_write_fires_dependent_subscriber() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();

    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    assert!(wb.set_formula(s1, "B1", "=Data!A1*2"));

    // Subscribe AFTER the formula is installed so we measure only
    // fanout from the upcoming write.
    let changes = Rc::new(RefCell::new(0u32));
    let changes_clone = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("B1", move || {
        *changes_clone.borrow_mut() += 1;
    });

    wb.set_cell(data_idx, "A1", Value::Number(7.0));

    assert!(
        *changes.borrow() >= 1,
        "subscriber on Sheet1!B1 must fire when Data!A1 is written via wb.set_cell; got {}",
        *changes.borrow()
    );
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Number(14.0),
        "formula must observe the new cross-sheet value on subsequent read"
    );
}

/// `sheet_mut` writes participate in cross-sheet propagation because every
/// attached sheet shares the workbook-scoped Store context.
#[test]
fn raw_sheet_write_uses_shared_store_cross_sheet_subscriber() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();

    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    assert!(wb.set_formula(s1, "B1", "=Data!A1*2"));

    let changes = Rc::new(RefCell::new(0u32));
    let changes_clone = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("B1", move || {
        *changes_clone.borrow_mut() += 1;
    });

    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(7.0));

    assert_eq!(
        *changes.borrow(),
        1,
        "shared Store propagation should publish the changed formula once"
    );
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(14.0));
}

/// Chained cross-sheet propagation: `Sheet1!D = =Sheet2!C`,
/// `Sheet2!C = =Sheet3!A`. A write to `Sheet3!A` must rederive both
/// materialized downstream formula atoms.
#[test]
fn cross_sheet_chain_fires_transitive_subscribers() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sheet3");
    let s1 = wb.index_of("Sheet1").unwrap();

    wb.sheet_mut(s3).unwrap().set_cell("A1", Value::Number(1.0));
    assert!(wb.set_formula(s2, "C1", "=Sheet3!A1"));
    assert!(wb.set_formula(s1, "D1", "=Sheet2!C1"));

    let s1_changes = Rc::new(RefCell::new(0u32));
    let s2_changes = Rc::new(RefCell::new(0u32));
    {
        let s1c = s1_changes.clone();
        wb.sheet_mut(s1).unwrap().subscribe_cell("D1", move || {
            *s1c.borrow_mut() += 1;
        });
        let s2c = s2_changes.clone();
        wb.sheet_mut(s2).unwrap().subscribe_cell("C1", move || {
            *s2c.borrow_mut() += 1;
        });
    }

    wb.set_cell(s3, "A1", Value::Number(99.0));

    assert!(
        *s2_changes.borrow() >= 1,
        "transitive subscriber on Sheet2!C1 must fire when Sheet3!A1 is written"
    );
    assert!(
        *s1_changes.borrow() >= 1,
        "transitive subscriber on Sheet1!D1 must fire through Sheet2!C1"
    );
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(99.0));
}

/// Clearing a cross-sheet source publishes the same Store update as writing
/// `Value::Null`, so materialized downstream formulas rederive.
#[test]
fn cross_sheet_clear_fires_dependent_subscriber() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();
    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    assert!(wb.set_formula(s1, "B1", "=Data!A1*2"));

    let changes = Rc::new(RefCell::new(0u32));
    let cc = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("B1", move || {
        *cc.borrow_mut() += 1;
    });

    wb.clear_cell(data_idx, "A1");
    assert!(*changes.borrow() >= 1);
}
