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

//!
//! claims 的上限与复活顺序在 `spill_write_revive_claims.rs`，代价在
//! `spill_write_revive_cost.rs` —— 那两件问的是机制的性质，不是语义。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{Sheet, Workbook};

mod spill_write_support;
use spill_write_support::column_spill_sheet;

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
