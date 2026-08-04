//! `DepGraphStats` 各计数器的口径。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

#[test]
fn debug_counters_reflect_lazy_formula_baseline() {
    let mut sheet = Sheet::new();
    assert_eq!(sheet.debug_primitive_atom_count(), 0);
    assert_eq!(sheet.debug_formula_count(), 0);
    assert_eq!(sheet.debug_total_atom_count(), 0);

    sheet.set_cell("A1", Value::Number(1.0));
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(sheet.debug_total_atom_count(), 1);

    sheet.set_formula("B1", "=A1+Z99");
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(sheet.debug_formula_count(), 1);
    assert_eq!(sheet.debug_total_atom_count(), 2);

    assert_eq!(sheet.debug_dependents_count("A1"), 0);
    assert_eq!(sheet.debug_dependents_count("Z99"), 0);

    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(sheet.debug_total_atom_count(), 8);

    let b1 = CellAddress::parse("B1").unwrap();
    for addr_str in ["A1", "Z99"] {
        let addr = CellAddress::parse(addr_str).unwrap();
        let mut roots = Vec::new();
        sheet.store_root_atoms_for_addr_into(addr, &mut roots);
        assert!(
            sheet
                .store_dependent_formula_addrs_from_atoms(&roots)
                .contains(&b1),
            "{addr_str} should have a Store edge into B1 after formula read"
        );
    }
}

#[test]
fn debug_subscribe_empty_cell_does_not_materialize() {
    let mut sheet = Sheet::new();
    let _sub = sheet.subscribe_cell("Z99", || {});
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        0,
        "subscribing to an empty cell must not materialize an atom"
    );
    assert_eq!(
        sheet.debug_total_atom_count(),
        2,
        "subscribing anchors the empty cell with a facade plus slot epoch"
    );
}

// === B1 — counter additions ===

#[test]
fn debug_formula_eval_count_bumps_on_miss_not_on_hit() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=A1");
    // No read yet — counter must be zero.
    assert_eq!(sheet.debug_formula_eval_count(), 0);

    // First read: cold formula-inner → exactly one eval.
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));
    assert_eq!(sheet.debug_formula_eval_count(), 1);

    // Second read: settled Store-derived value → no additional eval.
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));
    assert_eq!(sheet.debug_formula_eval_count(), 1);
}

#[test]
fn debug_dirty_count_drops_after_read() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_formula("B1", "=A1");

    // Pre-read: formula is dirty.
    assert_eq!(sheet.debug_dirty_count(), 1);

    // Read clears the dirty bit.
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(sheet.debug_dirty_count(), 0);

    // Writing a dep now propagates through the Store-derived formula inner;
    // the formula cache is already refreshed by the atomm path.
    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.debug_dirty_count(), 0);
}

#[test]
fn debug_imported_formula_count_counts_bulk_load_only() {
    let mut sheet = Sheet::new();
    // Plain set_formula must NOT bump the imported counter.
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=A1");
    assert_eq!(sheet.debug_imported_formula_count(), 0);

    // bulk_load with 5 formulas + 5 primitives — only the formulas bump.
    sheet.bulk_load(|loader| {
        for n in 0..5u32 {
            let addr = CellAddress::new(0, n + 2).to_string_repr();
            loader.set_cell(&addr, Value::Number(n as f64));
        }
        for n in 0..5u32 {
            let addr = CellAddress::new(1, n + 2).to_string_repr();
            let ok = loader.set_formula(&addr, "=A1+1");
            assert!(ok, "bulk-load formula at {} must register", addr);
        }
    });
    assert_eq!(sheet.debug_imported_formula_count(), 5);
}

#[test]
fn debug_live_subscription_count_tracks_buckets() {
    let mut sheet = Sheet::new();
    assert_eq!(sheet.debug_live_subscription_count(), 0);

    let sub_a = sheet.subscribe_cell("A1", || {});
    let _sub_b = sheet.subscribe_cell("B2", || {});
    assert_eq!(sheet.debug_live_subscription_count(), 2);

    // A second listener on A1 reuses the existing bucket — still 2.
    let _sub_a2 = sheet.subscribe_cell("A1", || {});
    assert_eq!(sheet.debug_live_subscription_count(), 2);

    // Drop one A1 listener; bucket survives (still has the second one).
    sheet.unsubscribe_cell(sub_a);
    assert_eq!(sheet.debug_live_subscription_count(), 2);
}

#[test]
fn debug_range_dep_count_counts_materialized_geometry_roots() {
    let mut sheet = Sheet::new();
    assert_eq!(sheet.debug_range_dep_count(), 0);

    sheet.set_formula("C1", "=SUM(A1:A300)");
    assert_eq!(sheet.debug_range_dep_count(), 0, "roots are read-lazy");
    assert_eq!(sheet.get_cell("C1"), Value::Number(0.0));
    assert_eq!(sheet.debug_range_dep_count(), 2);

    sheet.set_formula("C2", "=AVERAGE(A1:A300)");
    assert_eq!(
        sheet.get_cell("C2"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        sheet.debug_range_dep_count(),
        2,
        "consumers share the same two band roots"
    );

    sheet.set_formula("C3", "=SUM(B1:B5)");
    assert_eq!(sheet.get_cell("C3"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_range_dep_count(),
        2,
        "Tier-A ranges use facades and add no geometry root"
    );
}
