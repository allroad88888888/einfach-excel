//! ADR 0006 阶段 2 的复活机制自身的**边界条件**：blocked-claims 的上限，
//! 以及多个 anchor 争抢同一次复活时的顺序。
//!
//! 与 `spill_write_revive.rs` 分开的理由：那边问「该不该复活」，这边问「登记表
//! 撑不住时会怎样、以及复活顺序稳不稳定」。后者一旦退化成 HashMap 的迭代顺序，
//! 症状是间歇性的错值而不是失败，所以必须单独钉住。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

mod spill_write_support;

// =====================================================================
// Stage 2 — caps and determinism
// =====================================================================

/// Over `SPILL_BLOCKED_CLAIM_RECT_LIMIT` (4096 cells) the rectangle is not
/// claimed and the anchor degrades to exactly the pre-ADR behaviour: still
/// `#SPILL!`, still retried by structural edits, but no auto-revive. Below the
/// cap the same scenario revives, which is what makes this a cap test rather
/// than a "does anything happen" test.
#[test]
fn oversized_rectangle_registers_no_claims_and_does_not_auto_revive() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(99.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(5000)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "the anchor is still parked — only the per-cell claims degrade"
    );
    assert_eq!(
        sheet.debug_spill_blocked_claim_count(),
        0,
        "5000 > 4096: no claims registered"
    );

    sheet.clear_cell("A3");
    assert_eq!(
        sheet.get_cell("A1"),
        Value::Error(ValueError::Spill),
        "degraded: no claim, so nothing tells the engine to retry"
    );
    // A structural edit still retries it (the stage 0 pipeline is untouched).
    sheet.insert_row(50, 1);
    match sheet.get_cell("A1") {
        Value::Array(a) => assert_eq!(a.shape(), (5000, 1)),
        other => panic!("structural retry must still work, got {other:?}"),
    }
}

/// Just under the cap, the same shape DOES claim and DOES revive.
#[test]
fn rectangle_at_the_cap_registers_claims_and_revives() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(99.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(4000)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.debug_spill_blocked_claim_count(),
        3999,
        "every non-anchor cell of the rectangle is claimed"
    );

    sheet.clear_cell("A3");
    match sheet.get_cell("A1") {
        Value::Array(a) => assert_eq!(a.shape(), (4000, 1)),
        other => panic!("under the cap the array revives, got {other:?}"),
    }
    assert_eq!(sheet.debug_spill_blocked_claim_count(), 0, "claims retired");
}

/// Two blocked anchors contending for one freed cell must resolve the same way
/// in every process. The claim list at B2 names both, and everything that
/// consumes it sorts row-major, so B1 (row 0) always beats A2 (row 1).
///
/// The loop matters: `RandomState` re-seeds per container, so fresh sheets in
/// ONE process sample different hash orders. Without the sort in
/// `recompute_array_formulas_in` this flips within a handful of iterations —
/// the same failure mode `spill_rederive_order.rs` pins for the structural
/// path.
#[test]
fn contended_revive_order_is_row_major_not_hash_order() {
    for iteration in 0..32 {
        let mut sheet = Sheet::new();
        sheet.set_cell("B2", Value::Number(999.0));
        assert!(sheet.set_formula("B1", "=SEQUENCE(3,1)")); // wants B1:B3
        assert!(sheet.set_formula("A2", "=SEQUENCE(1,3)")); // wants A2:C2
        assert_eq!(sheet.get_cell("B1"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::Spill));

        sheet.clear_cell("B2");

        match sheet.get_cell("B1") {
            Value::Array(a) => assert_eq!(a.shape(), (3, 1)),
            other => panic!("iteration {iteration}: B1 must win B2 (row-major), got {other:?}"),
        }
        assert_eq!(
            sheet.get_cell("A2"),
            Value::Error(ValueError::Spill),
            "iteration {iteration}: A2 lost the contested cell and stays blocked"
        );
        assert_eq!(sheet.get_cell("B2"), Value::Number(2.0), "B1's projection");
        assert_eq!(sheet.get_cell("C2"), Value::Null, "A2 installed nothing");
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1, "only A2 left");
    }
}
