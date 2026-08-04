//! 公式成环的识别与拒绝。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

#[test]
fn bulk_load_cycle_check_still_runs() {
    // LAZY_FORMULA_INDEXING Phase 3 contract change: bulk_load no
    // longer eagerly parses formulas — cycles installed via
    // bulk_load surface at first read (matching the TS port).
    // `set_formula` inside bulk_load now returns `true`
    // unconditionally; the cycle becomes a `#CIRCULAR!` on the
    // first read of any cycle member.
    let mut sheet = Sheet::new();
    let mut a_ok = true;
    let mut b_ok = true;
    sheet.bulk_load(|loader| {
        a_ok = loader.set_formula("A1", "=B1+1");
        b_ok = loader.set_formula("B1", "=A1+1");
    });
    assert!(a_ok, "lazy bulk_load always returns true (cycle deferred)");
    assert!(b_ok, "lazy bulk_load always returns true (cycle deferred)");
    // B1 holds the cycle error; reading it must not stack-overflow.
    // Hydration parses both formulas — A1's hydration installs
    // edges, then B1's cycle check sees the edge from A1 (which
    // depends on B1) and surfaces the cycle.
    let b1 = sheet.get_cell("B1");
    assert!(
        matches!(b1, Value::Error(ValueError::CyclicRef)),
        "B1 read must surface the cycle once hydrated; got {:?}",
        b1
    );
}

#[test]
fn parked_cycle_certificate_is_invalidated_by_topology_change() {
    let mut sheet = Sheet::new();
    sheet.bulk_load(|loader| {
        loader.set_formula("A2", "=A3");
        loader.set_cell("A3", Value::Number(1.0));
    });

    assert_eq!(sheet.get_cell("A2"), Value::Number(1.0));
    let a2 = CellAddress::parse("A2").unwrap();
    let certified_epoch = sheet
        .interior
        .formula_cells
        .borrow()
        .get(&a2)
        .unwrap()
        .cycle_checked_at
        .get();
    assert_eq!(certified_epoch, sheet.formula_topology_epoch.get());

    // This is the pruning counterexample: A2 was valid while A3 was a
    // literal, then A3 changes to point back to A2. The mutation must make
    // A2's old certificate unusable before A3's first hydration.
    sheet.bulk_load(|loader| {
        loader.set_formula("A3", "=A2");
    });
    assert_ne!(certified_epoch, sheet.formula_topology_epoch.get());
    assert_eq!(sheet.get_cell("A3"), Value::Error(ValueError::CyclicRef));

    let a3 = CellAddress::parse("A3").unwrap();
    let expr = sheet
        .interior
        .formula_exprs
        .borrow()
        .get(&a3)
        .cloned()
        .unwrap();
    assert!(matches!(expr.as_ref(), Expr::Error(ValueError::CyclicRef)));
}

#[test]
fn tail_first_chain_static_cycle_walk_is_linear() {
    const N: u32 = 512;
    let mut sheet = Sheet::new();
    sheet.bulk_load(|loader| {
        loader.set_cell("A1", Value::Number(1.0));
        for row in 2..=N {
            loader.set_formula(&format!("A{row}"), &format!("=A{}+1", row - 1));
        }
    });

    let before = sheet.debug_static_cycle_node_visit_count();
    assert_eq!(sheet.get_cell(&format!("A{N}")), Value::Number(N as f64));
    assert_eq!(
        sheet.debug_static_cycle_node_visit_count() - before,
        (N - 1) as u64,
        "one temporary reachable-graph pass must certify the whole chain"
    );

    let after_tail = sheet.debug_static_cycle_node_visit_count();
    for row in 2..=N {
        let _ = sheet.get_cell(&format!("A{row}"));
    }
    assert_eq!(
        sheet.debug_static_cycle_node_visit_count(),
        after_tail,
        "later hydrations must reuse same-topology certificates"
    );
}

/// The local cycle check must consult range expressions, not just point
/// refs. After `=SUM(A1:A100)` evaluates with empty A2..A100, only A1 is
/// read dynamically, but the static range expression still covers A50.
#[test]
fn range_cycle_detected_after_sparse_eval() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("B1", "=SUM(A1:A100)"));
    // Read forces eval, but static cycle detection still sees the range.
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));
    // A50 is inside A1:A100 and is empty — register a back-edge to B1.
    // This forms a cycle through the range dep.
    let ok = sheet.set_formula("A50", "=B1");
    assert!(!ok, "set_formula should reject the range-mediated cycle");
}

#[test]
fn direct_unbounded_self_reference_keeps_legacy_ref_behavior() {
    let mut sheet = Sheet::new();

    assert!(sheet.set_formula("D35", "=SUM(D:D)"));
    assert_eq!(sheet.get_formula("D35").as_deref(), Some("=SUM(D:D)"));
    assert_eq!(sheet.get_cell("D35"), Value::Error(ValueError::CyclicRef));
}

#[test]
fn unbounded_range_cycle_is_rejected_before_store_edges_exist() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("C3", "=SUM(B:B)"));

    // C3 has never been read, so its formula-inner has no committed Store
    // edges. The install-time source walk must still see that B:B contains
    // B26 and reject B26 -> C3 -> B:B -> B26.
    assert!(!sheet.set_formula("B26", "=SUM(A1:C10)"));
    assert_eq!(sheet.get_formula("B26"), None);
    assert_eq!(sheet.get_cell("B26"), Value::Error(ValueError::CyclicRef));
}

#[test]
fn unbounded_range_cycle_follows_formula_cells_inside_the_range() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("B5", "=A1"));
    assert!(sheet.set_formula("C1", "=SUM(B:B)"));

    // A1 -> C1 -> B:B -> B5 -> A1. Walking only direct refs or checking
    // whether B:B contains A1 would miss the formula hop through B5.
    assert!(!sheet.set_formula("A1", "=C1"));
    assert_eq!(sheet.get_formula("A1"), None);
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::CyclicRef));
}
