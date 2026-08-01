//! ADR 0006 stage 2 — the array comes back when its obstruction goes away.
//!
//! `docs/decisions/0006-spill-region-write-semantics.md`. Stage 1 (the write
//! landing and the array withdrawing) is the sibling file
//! `spill_write_collapse.rs`; the two ship together because stage 1 alone would
//! trade "cannot type here" for "cannot get the array back".
//!
//! A collided anchor installs nothing, so it has no entry in any of the three
//! installed-spill maps and the engine could not get from the obstructing
//! ADDRESS back to the anchor. The blocked-claims registry
//! (`src/sheet_spill_claims.rs`) is that missing direction. Its caps, its
//! ordering guarantee and its cost are all pinned below.

use einfach_core::{Value, ValueError};
use einfach_excel_core::{Sheet, Workbook};

/// `=SEQUENCE(4)` at H1, spilled into H2:H4.
fn column_spill_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("H1", "=SEQUENCE(4)"));
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "spill landed");
    sheet
}

// =====================================================================
// Stage 2 — the array revives
// =====================================================================

/// The full round trip, mirroring the TS oracle
/// (`excel/excel-core-ts/test/workbook.test.ts:287`) statement for statement.
#[test]
fn collapse_then_clear_the_obstruction_revives_the_array() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=SEQUENCE(2,2)"));
    assert!(matches!(sheet.get_cell("A1"), Value::Array(_)));

    sheet
        .try_set_cell("B1", Value::Text("blocker".into()))
        .expect("write accepted");
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "the anchor parked as blocked, which is what makes the revive possible"
    );

    sheet.clear_cell("B1");

    match sheet.get_cell("A1") {
        Value::Array(a) => {
            assert_eq!(a.shape(), (2, 2));
            assert_eq!(a.get(0, 0), Some(&Value::Number(1.0)));
        }
        other => panic!("the array must come back, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A2"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("B2"), Value::Number(4.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
}

/// Overwriting the obstruction with different content keeps the anchor
/// blocked: the retry re-runs the real collision test rather than assuming a
/// claimed address was freed.
#[test]
fn replacing_the_obstruction_keeps_the_anchor_blocked() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(1.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(4)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));

    sheet.set_cell("A3", Value::Number(2.0));

    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "re-registered, not duplicated and not dropped"
    );
}

/// Clearing a cell inside the rectangle that was NOT the obstruction leaves
/// the anchor blocked — the retry runs and correctly re-collides.
#[test]
fn clearing_an_unrelated_cell_in_the_rectangle_does_not_revive() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A2", Value::Number(1.0));
    sheet.set_cell("A4", Value::Number(1.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(5)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));

    sheet.clear_cell("A4");

    assert_eq!(
        sheet.get_cell("A1"),
        Value::Error(ValueError::Spill),
        "A2 still obstructs"
    );
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);

    sheet.clear_cell("A2");
    match sheet.get_cell("A1") {
        Value::Array(a) => assert_eq!(a.shape(), (5, 1)),
        other => panic!("both obstructions gone — the array must revive, got {other:?}"),
    }
}

/// The bulk path revives too: the claims lookup lives in the shared setter
/// prologue, and `flush` unions the anchors into its re-projection set.
#[test]
fn bulk_clear_of_the_obstruction_revives_the_array() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(99.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(4)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));

    sheet.bulk_load(|loader| {
        loader.set_cell("A3", Value::Null);
    });

    match sheet.get_cell("A1") {
        Value::Array(a) => assert_eq!(a.shape(), (4, 1)),
        other => panic!("the array must revive through the bulk path, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0));
}

/// Round trip on one cell: collapse, revive, collapse again. Proves the two
/// registries hand off cleanly rather than leaking an entry per cycle.
///
/// The baseline is sampled after ONE warm-up cycle, not on the fresh sheet:
/// the first read of a cell materialises its facade / epoch scaffolding, which
/// is a one-time cost of observing the sheet and not something a cycle
/// produces. What must be flat is the per-cycle delta.
#[test]
fn collapse_revive_collapse_leaves_no_residue() {
    let mut sheet = column_spill_sheet();

    let cycle = |sheet: &mut Sheet| {
        sheet.try_set_cell("H3", Value::Number(1.0)).unwrap();
        assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);
        assert_eq!(sheet.debug_spill_target_count(), 0);

        sheet.clear_cell("H3");
        assert!(matches!(sheet.get_cell("H1"), Value::Array(_)));
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
        assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
        assert_eq!(sheet.debug_spill_target_count(), 3);
        assert_eq!(sheet.debug_spill_reverse_index_len(), 3);
    };

    cycle(&mut sheet);
    let settled_atoms = sheet.debug_total_atom_count();
    for _ in 0..3 {
        cycle(&mut sheet);
        assert_eq!(
            sheet.debug_total_atom_count(),
            settled_atoms,
            "a collapse/revive cycle must be atom-count neutral"
        );
    }
}

/// The route a write's own bookkeeping cannot see: withdrawing array X frees
/// the cells X was projecting into, and one of those is what blocked array Y.
/// The user touched X's anchor, which carries none of Y's claims — so the
/// teardown itself has to post them (`clear_spill` -> the pending queue).
///
/// Geometry: B1 spills B1:B3; A2 wants A2:C2 and is blocked by B1's projection
/// at B2. Deleting B1 must hand B2 to A2.
#[test]
fn tearing_down_one_array_revives_the_array_it_was_blocking() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("B1", "=SEQUENCE(3,1)"));
    assert!(sheet.set_formula("A2", "=SEQUENCE(1,3)"));
    assert_eq!(
        sheet.get_cell("A2"),
        Value::Error(ValueError::Spill),
        "precondition: B1's projection at B2 blocks A2"
    );
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);

    sheet.clear_cell("B1");

    match sheet.get_cell("A2") {
        Value::Array(a) => assert_eq!(a.shape(), (1, 3)),
        other => panic!("A2 must take the cells B1 released, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("B2"), Value::Number(2.0), "A2's projection");
    assert_eq!(sheet.get_cell("C2"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("B3"), Value::Null, "B1's array is gone");
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
}

/// Same route, driven by the ADR 0006 stage 1 collapse rather than an explicit
/// clear: typing into X's region withdraws X, which frees Y. Both halves of the
/// ADR in one op.
#[test]
fn collapsing_one_array_revives_the_array_it_was_blocking() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("B1", "=SEQUENCE(3,1)"));
    assert!(sheet.set_formula("A2", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::Spill));

    // B3 is B1's LAST projection cell — outside A2's rectangle, so this write
    // carries no claim of A2's at all.
    sheet.try_set_cell("B3", Value::Number(42.0)).unwrap();

    assert_eq!(sheet.get_cell("B3"), Value::Number(42.0), "write landed");
    assert_eq!(
        sheet.get_cell("B1"),
        Value::Error(ValueError::Spill),
        "B1 withdrew"
    );
    match sheet.get_cell("A2") {
        Value::Array(a) => assert_eq!(a.shape(), (1, 3)),
        other => panic!("A2 must take B2 once B1 lets go of it, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("B2"), Value::Number(2.0), "now A2's");
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1, "only B1 left");
}

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

// =====================================================================
// Cost — the ADR's "this moves onto the keystroke path" concern
// =====================================================================

/// Withdrawing a 10k-cell spill used to be reachable only by clearing the
/// anchor or editing structure. ADR 0006 puts it on "type a character into
/// the spill region", so the leak probe `scale_suite.rs`'s `s5` runs for
/// structural edits has to run for this path too: the collapse must destroy
/// exactly the atoms it created, and the revive must restore the baseline.
#[test]
fn atom_count_returns_to_baseline_across_a_10k_collapse_and_revive() {
    const N: u32 = 10_000;
    let mut sheet = Sheet::new();
    let empty_atoms = sheet.debug_total_atom_count();

    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));
    assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
    let spilled_atoms = sheet.debug_total_atom_count();

    // One keystroke in the middle of the region.
    sheet
        .try_set_cell(&format!("A{}", N / 2), Value::Number(1.0))
        .expect("write accepted");
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    let collapsed_atoms = sheet.debug_total_atom_count();
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(sheet.debug_spill_reverse_index_len(), 0);
    // The collapse must actually reclaim the projection atoms, not strand
    // them: what is left is the empty-sheet baseline plus the anchor, the
    // written cell, and their facade/epoch scaffolding — bounded by a small
    // constant, NOT by N.
    assert!(
        collapsed_atoms < empty_atoms + 64,
        "collapse leaked: {collapsed_atoms} atoms vs {empty_atoms} on an empty sheet"
    );

    // 10k > SPILL_BLOCKED_CLAIM_RECT_LIMIT, so this anchor is in the degraded
    // tier and clearing the obstruction does not auto-revive it. Re-installing
    // the formula is the explicit re-trigger; the atom count must come back to
    // the pre-collapse figure plus at most the fixed scaffolding the two
    // addresses this test READ have materialised since — a constant, never
    // anything that scales with N.
    sheet.clear_cell(&format!("A{}", N / 2));
    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));
    assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
    let respilled_atoms = sheet.debug_total_atom_count();
    assert!(
        respilled_atoms >= spilled_atoms && respilled_atoms - spilled_atoms <= 16,
        "re-spill must return to the pre-collapse count (+ read scaffolding): \
         {respilled_atoms} vs {spilled_atoms}"
    );
}

/// The same round trip just UNDER the claim cap, so the revive half runs
/// through the stage 2 path rather than an explicit re-trigger. Together with
/// the 10k probe above this covers both tiers.
#[test]
fn atom_count_returns_to_baseline_across_a_capped_collapse_and_revive() {
    const N: u32 = 4_000;
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));

    let cycle = |sheet: &mut Sheet| {
        sheet.try_set_cell("A1000", Value::Number(1.0)).unwrap();
        assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.debug_spill_target_count(), 0, "projection reclaimed");
        assert_eq!(sheet.debug_spill_blocked_claim_count(), (N - 1) as usize);

        sheet.clear_cell("A1000");
        assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
        assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
    };

    // First cycle settles the read scaffolding for the addresses involved;
    // every cycle after it must be exactly atom-count neutral, which is the
    // property that matters when this path is a keystroke.
    cycle(&mut sheet);
    let settled_atoms = sheet.debug_total_atom_count();
    for _ in 0..3 {
        cycle(&mut sheet);
        assert_eq!(
            sheet.debug_total_atom_count(),
            settled_atoms,
            "a {N}-cell collapse/auto-revive cycle must be atom-count neutral"
        );
    }
}

// =====================================================================
// Cross-sheet
// =====================================================================

/// A formula on another sheet reading a projection cell re-derives when the
/// array withdraws. The edge is a Store edge through the cell's facade atom,
/// so nothing spill-specific carries it — this pins that the collapse bumps
/// the facades it must.
#[test]
fn cross_sheet_formula_reading_a_collapsed_projection_cell_recomputes() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");
    assert!(wb.set_formula(0, "A1", "=SEQUENCE(3)"));
    assert!(wb.set_formula(1, "B1", "=Sheet1!A3+100"));
    assert_eq!(wb.get_cell("Sheet2", "B1"), Value::Number(103.0));

    wb.try_set_cell(0, "A2", Value::Number(50.0))
        .expect("write accepted");

    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        wb.get_cell("Sheet2", "B1"),
        Value::Number(100.0),
        "A3 emptied when the array withdrew, so the cross-sheet formula reads 0"
    );

    // And the reverse trip.
    wb.clear_cell(0, "A2");
    assert_eq!(wb.get_cell("Sheet2", "B1"), Value::Number(103.0));
}
