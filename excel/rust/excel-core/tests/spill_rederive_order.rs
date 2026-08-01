//! ADR 0006 stage 0 follow-on — the post-shift spill re-derive order must be
//! imposed, not inherited from a hash seed.
//!
//! Once structural edits retry COLLIDED anchors (see
//! `spill_blocked_anchor_structural.rs`), two anchors can contend for a
//! rectangle the shift just freed, which puts the re-derive ORDER on the
//! observable path. `apply_structural_shift` builds that order by draining two
//! hash containers — `spill_targets` (installed anchors) and
//! `spill_blocked_anchors` (collided ones) — and `RandomState` seeds those per
//! process, so the raw iteration order is not reproducible.
//!
//! The golden replay oracle caught this as a run-to-run flip on seed 53
//! (`=SEQUENCE(3,1,N23)` starting at 0 or at 273 depending on whether the
//! anchor owning N23 had re-derived yet). Both lists are now sorted row-major
//! — the same tie-break `sort.rs` §5.1 uses for its spill gate — and installed
//! anchors are re-derived before collided ones so a spill that owned its
//! rectangle before the shift keeps first claim on it.

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

/// Retrying collided anchors means two of them can contend for a rectangle a
/// shift just freed, which puts the re-derive ORDER on the observable path.
/// Both snapshot lists are drained from hash containers, so the order must be
/// imposed explicitly (row-major, matching `sort.rs` §5.1's tie-break) rather
/// than inherited from a per-process hash seed.
///
/// The scenario: one literal at B2 blocks BOTH anchors, and their rectangles
/// overlap at B2 while neither anchor sits inside the other's rectangle.
/// Clearing B2 now retries them immediately (ADR 0006 stage 2 — the same
/// contention through the CLAIMS path is pinned by
/// `spill_write_revive.rs`'s `contended_revive_order_is_row_major_not_hash_order`);
/// the far-away `insert_row` after it retries both again through the
/// STRUCTURAL path, which is the ordering this file is about. Exactly one can
/// win: B1 is (row 0, col 1) and A2 is (row 1, col 0), so row-major order
/// hands B2 to B1 every time, on both paths.
///
/// The loop matters: `RandomState` re-seeds per container, so fresh sheets in
/// ONE process sample different orders. Without the sort this flips within a
/// handful of iterations.
#[test]
fn contended_rederive_order_is_row_major_not_hash_order() {
    for iteration in 0..32 {
        let mut sheet = Sheet::new();
        sheet.set_cell("B2", Value::Number(999.0));
        assert!(sheet.set_formula("B1", "=SEQUENCE(3,1)")); // wants B1:B3
        assert!(sheet.set_formula("A2", "=SEQUENCE(1,3)")); // wants A2:C2
        assert_eq!(sheet.get_cell("B1"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 2);

        sheet.clear_cell("B2");
        sheet.insert_row(30, 1); // far-away shift — retries both anchors

        match sheet.get_cell("B1") {
            Value::Array(arr) => assert_eq!(arr.shape(), (3, 1)),
            other => panic!("iteration {iteration}: B1 must win B2 (row-major), got {other:?}"),
        }
        assert_eq!(
            sheet.get_cell("A2"),
            Value::Error(ValueError::Spill),
            "iteration {iteration}: A2 lost the contested cell and stays blocked"
        );
        assert_eq!(sheet.get_cell("B2"), Value::Number(2.0), "B1's target");
        assert_eq!(sheet.get_cell("C2"), Value::Null, "A2 installed nothing");
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1, "only A2 left");
    }
}
