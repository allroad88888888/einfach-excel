//! Workbook dependency tests.

use std::cell::RefCell;
use std::rc::Rc;

use super::*;
use einfach_core::ValueError;

/// Replacing a formula updates its dynamic Store dependencies, so writes to
/// the old source no longer publish the formula while the new source does.
#[test]
fn cross_sheet_formula_replacement_drops_stale_store_dependency() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let extra_idx = wb.add_sheet("Extra");
    let s1 = wb.index_of("Sheet1").unwrap();

    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(1.0));
    wb.sheet_mut(extra_idx)
        .unwrap()
        .set_cell("A1", Value::Number(100.0));
    assert!(wb.set_formula(s1, "B1", "=Data!A1*2"));

    // Replace with a formula that references Extra instead.
    assert!(wb.set_formula(s1, "B1", "=Extra!A1*2"));

    let changes = Rc::new(RefCell::new(0u32));
    let cc = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("B1", move || {
        *cc.borrow_mut() += 1;
    });
    // Writing the OLD source must NOT fire the subscriber.
    wb.set_cell(data_idx, "A1", Value::Number(7.0));
    assert_eq!(
        *changes.borrow(),
        0,
        "the old source must no longer be a Store dependency"
    );
    // Writing the NEW source must fire it.
    wb.set_cell(extra_idx, "A1", Value::Number(8.0));
    assert!(*changes.borrow() >= 1);
}

#[test]
fn cross_sheet_range_formula_replacement_drops_stale_store_dependency() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();

    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(1.0));
    assert!(wb.set_formula(s1, "D1", "=SUM(Data!A1:A10)"));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(1.0));

    assert!(wb.set_formula(s1, "D1", "=1"));
    let changes = Rc::new(RefCell::new(0u32));
    let cc = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("D1", move || {
        *cc.borrow_mut() += 1;
    });

    wb.set_cell(data_idx, "A5", Value::Number(10.0));
    assert_eq!(
        *changes.borrow(),
        0,
        "the replaced range must no longer be a Store dependency"
    );
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(1.0));
}

#[test]
fn cross_sheet_range_write_fires_same_addr_dependents_on_multiple_sheets() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let other_idx = wb.add_sheet("Other");
    let s1 = wb.index_of("Sheet1").unwrap();

    assert!(wb.set_formula(s1, "D1", "=SUM(Data!A1:A10)"));
    assert!(wb.set_formula(other_idx, "D1", "=SUM(Data!A1:A10)"));

    let s1_changes = Rc::new(RefCell::new(0u32));
    let other_changes = Rc::new(RefCell::new(0u32));
    {
        let c = s1_changes.clone();
        wb.sheet_mut(s1)
            .unwrap()
            .subscribe_cell("D1", move || *c.borrow_mut() += 1);
    }
    {
        let c = other_changes.clone();
        wb.sheet_mut(other_idx)
            .unwrap()
            .subscribe_cell("D1", move || *c.borrow_mut() += 1);
    }

    wb.set_cell(data_idx, "A5", Value::Number(10.0));

    assert!(*s1_changes.borrow() >= 1, "Sheet1!D1 must fire for Data!A5");
    assert!(
        *other_changes.borrow() >= 1,
        "Other!D1 must also fire for Data!A5 despite sharing the same address"
    );
}

#[test]
fn cross_sheet_range_replacement_preserves_other_sheet_same_addr_edge() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let other_idx = wb.add_sheet("Other");
    let s1 = wb.index_of("Sheet1").unwrap();

    assert!(wb.set_formula(s1, "D1", "=SUM(Data!A1:A10)"));
    assert!(wb.set_formula(other_idx, "D1", "=SUM(Data!A1:A10)"));
    assert!(wb.set_formula(s1, "D1", "=1"));

    let other_changes = Rc::new(RefCell::new(0u32));
    {
        let c = other_changes.clone();
        wb.sheet_mut(other_idx)
            .unwrap()
            .subscribe_cell("D1", move || *c.borrow_mut() += 1);
    }

    wb.set_cell(data_idx, "A5", Value::Number(10.0));

    assert!(
        *other_changes.borrow() >= 1,
        "removing Sheet1!D1 must not remove Other!D1's same-address range edge"
    );
}

#[test]
fn cross_sheet_range_cycle_is_rejected_when_source_range_contains_target_reader() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();

    assert!(wb.set_formula(data_idx, "A2", "=Sheet1!D1"));
    assert!(
        !wb.set_formula(s1, "D1", "=SUM(Data!A1:A3)"),
        "candidate range should see Data!A2's formula edge back to Sheet1!D1"
    );
    assert_eq!(
        wb.get_cell("Sheet1", "D1"),
        Value::Error(ValueError::CyclicRef)
    );
}

/// Workbook-level `bulk_load` coalesces Store propagation and fires each
/// cross-sheet subscriber at most once at flush time.
#[test]
fn bulk_load_dedups_cross_sheet_subscriber_fanout() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    let s1 = wb.index_of("Sheet1").unwrap();
    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A1", Value::Number(1.0));
    wb.sheet_mut(data_idx)
        .unwrap()
        .set_cell("A2", Value::Number(2.0));
    // Formula depends on both sources, but one Store batch should publish
    // the derived formula only once.
    assert!(wb.set_formula(s1, "B1", "=Data!A1+Data!A2"));

    let changes = Rc::new(RefCell::new(0u32));
    let cc = changes.clone();
    wb.sheet_mut(s1).unwrap().subscribe_cell("B1", move || {
        *cc.borrow_mut() += 1;
    });

    wb.bulk_load(|loader| {
        loader.set_cell(data_idx, "A1", Value::Number(10.0));
        loader.set_cell(data_idx, "A2", Value::Number(20.0));
    });

    // Two writes to the same target → ONE subscriber fire.
    assert_eq!(
        *changes.borrow(),
        1,
        "bulk_load must dedup cross-sheet subscriber fanout"
    );
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(30.0));
}

/// Cycle detection walks current formula sources on demand and retains no
/// workbook dependency index. The debug counter records one candidate
/// cycle-check invocation per `set_formula` call.
#[test]
fn cross_sheet_cycle_walks_sources_on_demand_without_retained_graph() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let s1 = wb.index_of("Sheet1").unwrap();
    let s2 = wb.index_of("Sheet2").unwrap();

    // Install a non-cycle cross-sheet pair that the next check traverses:
    //   `Sheet1!A1 = =Sheet2!B1`
    //   `Sheet2!B1 = =Sheet1!D1`
    assert!(wb.set_formula(s1, "A1", "=Sheet2!B1"));
    assert!(wb.set_formula(s2, "B1", "=Sheet1!D1"));

    let before = wb.debug_cycle_ast_walk_count();

    // The traversal reaches Sheet2!B1 and Sheet1!D1, but never the
    // candidate Sheet1!C1, so this is not a cycle.
    assert!(
        wb.set_formula(s1, "C1", "=Sheet2!B1"),
        "re-reader of an existing cross-sheet source is not a cycle"
    );

    let after = wb.debug_cycle_ast_walk_count();
    let delta = after - before;
    assert_eq!(
        delta, 1,
        "each set_formula should record one on-demand cycle check; got {delta}"
    );

    // Sanity: the chain still evaluates correctly.
    assert!(matches!(
        wb.get_cell("Sheet1", "C1"),
        Value::Number(_) | Value::Null
    ));
}

/// Static cycle detection follows both same-sheet and cross-sheet hops by
/// walking each reachable formula source on demand.
///
/// Setup:
///   - `Sheet1!A1 = =Sheet2!B1` — cross-sheet edge.
///   - `Sheet2!B1 = =C1` — same-sheet edge.
///   - `Sheet2!C1 = =Sheet1!A1` — closing cross-sheet edge.
#[test]
fn static_cycle_check_follows_same_sheet_hop() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    let s1 = wb.index_of("Sheet1").unwrap();
    let s2 = wb.index_of("Sheet2").unwrap();

    assert!(wb.set_formula(s1, "A1", "=Sheet2!B1"));

    wb.sheet_mut(s2).unwrap().set_formula("B1", "=C1");

    assert!(
        !wb.set_formula(s2, "C1", "=Sheet1!A1"),
        "the on-demand source walk must detect the same-sheet hop"
    );
    assert_eq!(
        wb.get_cell("Sheet2", "C1"),
        Value::Error(ValueError::CyclicRef)
    );
}
