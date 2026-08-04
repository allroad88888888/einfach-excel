//! ADR 0006 stage 0 — structural edits must retry COLLIDED spill anchors.
//!
//! `docs/decisions/0006-spill-region-write-semantics.md` calls this out as a
//! pre-existing defect, independent of that ADR's semantic choice: when
//! `register_spill` rejects a bounding box it returns `Err(ValueError::Spill)`
//! without leaving an entry in any of the three spill maps
//! (`spill_targets` / `spill_target_anchor` / `spill_anchor_addr`) — correctly
//! so, since those maps describe an *installed* projection and a collided
//! anchor installed nothing.
//!
//! The cost was that `teardown_all_spills`, which enumerates `spill_targets`,
//! could not see such an anchor, so `rederive_spill_anchors` never retried it
//! after a row/column insert or delete. And `Error(Spill)` is a STICKY
//! primitive in `cells[addr]` — the facade prefers it over formula-inner and
//! `relocate_cells` carries it verbatim — so an edit that shifted the
//! obstruction clear of the rectangle left the anchor reading `#SPILL!`
//! forever. The fix threads a separate blocked-anchor registry through the
//! same snapshot → shift → re-derive pipeline the installed anchors use;
//! `spill_structural.rs` covers the installed-anchor half.
//!
//! NOT covered here, deliberately: reviving a blocked anchor when the
//! obstruction is merely *cleared* (no structural edit). That is ADR 0006
//! stage 2 — the `addr → anchor` claims index in `src/sheet_spill_claims.rs`
//! — and lives in `tests/spill_write_revive.rs`. This file stays the
//! STRUCTURAL half: the shift moves an obstruction into or out of a
//! rectangle, and no write is involved at all.

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Sheet};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

/// `H1 = SEQUENCE(3)` wanting H1:H3, obstructed by a literal at H3.
/// The anchor therefore parks in the collided state with zero targets.
fn blocked_column_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(3)"));
    assert_eq!(
        sheet.get_cell("H1"),
        Value::Error(ValueError::Spill),
        "precondition: obstructed anchor reads #SPILL!"
    );
    assert_eq!(
        sheet.debug_spill_anchor_count(),
        0,
        "precondition: nothing installed, so no entry in spill_targets"
    );
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "precondition: the collided anchor is registered as blocked"
    );
    sheet
}

/// Assert the three installed-spill maps stay in the lockstep the A-8
/// invariants demand, and that a blocked anchor never leaks into them.
fn assert_spill_indexes_consistent(sheet: &Sheet) {
    assert_eq!(
        sheet.debug_spill_reverse_index_len(),
        sheet.debug_spill_target_count(),
        "reverse spill index must mirror the installed target lists"
    );
    assert_eq!(
        sheet.debug_spill_anchor_index_len(),
        sheet.debug_spill_anchor_count(),
        "anchor-address index must mirror the installed anchor map"
    );
}

// =====================================================================
// Blocked → spilled: the shift frees the bounding box
// =====================================================================

/// The regression this file exists for. Inserting a row above the
/// obstruction pushes it from H3 to H4, out of the H1:H3 rectangle, so the
/// array must re-flow. Before the fix the anchor stayed `#SPILL!` and
/// H2/H3 stayed empty.
#[test]
fn row_insert_that_frees_the_box_respills_the_blocked_anchor() {
    let mut sheet = blocked_column_sheet();

    sheet.insert_row(1, 1);

    match sheet.get_cell("H1") {
        Value::Array(arr) => assert_eq!(arr.shape(), (3, 1), "H1 re-flowed as a 3x1 array"),
        other => panic!("H1 must respill once the obstruction leaves the box, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("H2"), Value::Number(2.0), "target installed");
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "target installed");
    assert_eq!(
        sheet.get_cell("H4"),
        Value::Number(999.0),
        "the obstruction itself rode the shift down to H4"
    );
    assert_eq!(sheet.spill_info(addr("H1")), Some((3, 1)));
    assert_eq!(sheet.spill_anchor_for(addr("H2")), Some(addr("H1")));

    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        0,
        "the claim is retired once the anchor spills cleanly"
    );
    assert_eq!(sheet.debug_spill_anchor_count(), 1);
    assert_eq!(sheet.debug_spill_target_count(), 2);
    assert_spill_indexes_consistent(&sheet);
}

/// Same story on the column axis: `C1 = SEQUENCE(1,3)` wants C1:E1, is
/// obstructed at E1, and an inserted column pushes the obstruction to F1.
#[test]
fn col_insert_that_frees_the_box_respills_the_blocked_anchor() {
    let mut sheet = Sheet::new();
    sheet.set_cell("E1", Value::Number(999.0));
    assert!(sheet.set_formula("C1", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("C1"), Value::Error(ValueError::Spill));

    // Insert one column at D (0-based col 3): E1 -> F1, anchor C1 stays.
    sheet.insert_col(3, 1);

    match sheet.get_cell("C1") {
        Value::Array(arr) => assert_eq!(arr.shape(), (1, 3), "C1 re-flowed as a 1x3 array"),
        other => panic!("C1 must respill, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("D1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("E1"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("F1"), Value::Number(999.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_spill_indexes_consistent(&sheet);
}

// =====================================================================
// Negative control: the shift moves the obstruction but not out of the box
// =====================================================================

/// A `SEQUENCE(10)` at H1 owns H1:H10. Inserting one row moves the
/// obstruction from H3 to H4 — still inside — so the anchor must REMAIN
/// `#SPILL!` and must not install partial targets. Without this control the
/// positive test above would also pass on a fix that respills blindly.
#[test]
fn row_insert_that_keeps_the_obstruction_inside_the_box_stays_spill() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));

    sheet.insert_row(1, 1);

    assert_eq!(
        sheet.get_cell("H1"),
        Value::Error(ValueError::Spill),
        "obstruction moved H3 -> H4, still inside H1:H10 — anchor stays #SPILL!"
    );
    assert_eq!(sheet.get_cell("H4"), Value::Number(999.0));
    for cell in ["H2", "H3", "H5", "H10"] {
        assert_eq!(
            sheet.get_cell(cell),
            Value::Null,
            "{cell} must stay empty — a collided anchor installs NO targets"
        );
    }
    assert_eq!(sheet.spill_info(addr("H1")), None, "no spill shape");
    assert_eq!(sheet.debug_spill_anchor_count(), 0);
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "still exactly one blocked claim — re-registered, not duplicated"
    );
    assert_spill_indexes_consistent(&sheet);
}

/// The registry must not grow across repeated shifts that leave the anchor
/// blocked. This is the bound that lets the set stay untracked by any cap.
#[test]
fn repeated_shifts_do_not_grow_the_blocked_registry() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(20)"));

    for _ in 0..5 {
        sheet.insert_row(1, 1);
        assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));
        assert_eq!(
            sheet.debug_spill_blocked_anchor_count(),
            1,
            "one anchor, one claim, however many shifts"
        );
    }
}

// =====================================================================
// Spilled → blocked: the shift pushes an obstruction INTO the box
// =====================================================================

/// The inverse direction, which also proves the registry gets populated by
/// the structural path itself. A healthy `A1 = SEQUENCE(3)` owns A1:A3;
/// deleting row 2 drags a literal from A4 up to A3, inside the rectangle.
#[test]
fn row_delete_that_pushes_an_obstruction_into_the_box_blocks_the_anchor() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=SEQUENCE(3)"));
    sheet.set_cell("A4", Value::Number(999.0));
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0), "spilled cleanly");
    assert_eq!(sheet.debug_spill_anchor_count(), 1);
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);

    // Delete 0-based row 1 (the A2 target): A4 -> A3, anchor stays at A1.
    sheet.delete_row(1, 1);

    assert_eq!(
        sheet.get_cell("A1"),
        Value::Error(ValueError::Spill),
        "the shift dragged the obstruction into A1:A3"
    );
    assert_eq!(sheet.get_cell("A3"), Value::Number(999.0), "preserved");
    assert_eq!(sheet.get_cell("A2"), Value::Null, "no partial targets");
    assert_eq!(sheet.debug_spill_anchor_count(), 0, "nothing installed");
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "the now-collided anchor is registered for the next shift"
    );
    assert_spill_indexes_consistent(&sheet);

    // And the round trip: pushing it back out respills.
    sheet.insert_row(1, 1);
    match sheet.get_cell("A1") {
        Value::Array(arr) => assert_eq!(arr.shape(), (3, 1)),
        other => panic!("A1 must respill after the obstruction leaves again, got {other:?}"),
    }
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_spill_indexes_consistent(&sheet);
}

// =====================================================================
// Registry retirement — a claim must never outlive its anchor
// =====================================================================

/// Deleting the row that holds a blocked anchor must drop the claim: the
/// anchor's address maps to the `REF_INVALID` sentinel and is skipped by
/// `rederive_spill_anchors`, so nothing re-registers it.
#[test]
fn deleting_the_blocked_anchor_row_retires_the_claim() {
    let mut sheet = blocked_column_sheet();

    sheet.delete_row(0, 1);

    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        0,
        "claim dies with the anchor — no stale entry to re-derive later"
    );
    assert_eq!(sheet.get_cell("H1"), Value::Null, "anchor formula deleted");
    assert_eq!(sheet.get_cell("H2"), Value::Number(999.0), "shifted up");
}

/// Overwriting a blocked anchor with a literal retires the claim through
/// `clear_spill_at_address`, the hook every public write already funnels
/// through. A later shift that would have freed the box must NOT resurrect
/// the array — the formula is gone.
#[test]
fn overwriting_a_blocked_anchor_retires_the_claim() {
    let mut sheet = blocked_column_sheet();

    sheet.set_cell("H1", Value::Number(7.0));
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        0,
        "the write replaced the formula, so the claim is retired"
    );

    sheet.insert_row(1, 1);
    assert_eq!(
        sheet.get_cell("H1"),
        Value::Number(7.0),
        "no resurrection: the anchor is a literal now"
    );
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
}

/// Replacing a blocked anchor's formula with a scalar one retires the claim
/// too — `recompute_array_formula` clears it on entry and only the two
/// collision arms put it back.
#[test]
fn replacing_a_blocked_anchor_with_a_scalar_formula_retires_the_claim() {
    let mut sheet = blocked_column_sheet();

    assert!(sheet.set_formula("H1", "=1+1"));
    assert_eq!(sheet.get_cell("H1"), Value::Number(2.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);

    sheet.insert_row(1, 1);
    assert_eq!(sheet.get_cell("H1"), Value::Number(2.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
}
