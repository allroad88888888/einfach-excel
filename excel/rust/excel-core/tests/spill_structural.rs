//! AUDIT 2026-06-12 fix arc — W1.1 (findings A-4 + A-5,
//! `docs/AUDIT_PATTERN_FAMILY_2026-06-12.md` § A).
//!
//! A-4: `clear_range` (and every other `BulkLoader` write) must be
//! spill-aware. Semantics match the single-cell mutators
//! (`Sheet::try_set_cell` / `try_set_formula`):
//!   - a write to a spill ANCHOR tears the spill down and proceeds;
//!   - a Delete over a non-anchor spill TARGET is inert and the array stays
//!     intact (Excel: Delete over ghost cells of a dynamic array is a no-op);
//!   - a CONTENT write to a non-anchor spill TARGET lands and withdraws the
//!     array (ADR 0006 stage 1). That case has its own suite,
//!     `spill_write_collapse.rs` / `spill_write_revive.rs`; what this file
//!     keeps is the structural half — that the bookkeeping is coherent at the
//!     POST-SHIFT addresses, which the collapse now witnesses in place of the
//!     old `SpillCellWrite` rejection.
//!
//! A-5: structural edits (insert/delete row/col) must keep the spill
//! bookkeeping consistent. The engine tears every spill down before
//! the address shift and re-derives surviving anchors afterwards, so
//! spills always re-flow contiguously from the (possibly shifted)
//! anchor — matching Excel's recompute-after-structural-edit contract.

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Sheet};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end)).normalize()
}

/// Sheet-layer reads at a spill ANCHOR surface the full `Value::Array`
/// — the collapse to the top-left scalar happens only at the WASM
/// boundary (see `tests/spill_infra.rs` § "WASM boundary" and the
/// `clear_range_targets_only_is_noop_and_keeps_array` assertion below).
/// Assert the anchor holds an array whose top-left equals `expected`.
fn assert_anchor_top_left(sheet: &Sheet, cell: &str, expected: f64) {
    match sheet.get_cell(cell) {
        Value::Array(arr) => assert_eq!(
            arr.get(0, 0),
            Some(&Value::Number(expected)),
            "{cell} array top-left"
        ),
        other => panic!("{cell} must hold the spill array at the sheet layer, got {other:?}"),
    }
}

/// ADR 0006 stage 1 witness that the post-shift bookkeeping names the right
/// anchor. Before the ADR this file asserted `Err(SpillCellWrite { anchor })`
/// and read the anchor address straight out of the error; the write is now
/// accepted, so the same fact is witnessed by WHICH anchor the collapse hits:
/// the array withdraws from `anchor`, and `anchor` — not some stale pre-shift
/// address — is what ends up at `#SPILL!`.
///
/// This is a strictly stronger check than the old one. The rejection only
/// proved the reverse index pointed somewhere; this proves the whole
/// projection at the new addresses is coherent enough to be torn down and
/// re-derived.
fn assert_target_write_collapses_anchor(
    sheet: &mut Sheet,
    target: &str,
    anchor: &str,
    freed: &[&str],
) {
    sheet
        .try_set_cell(target, Value::Number(7.0))
        .unwrap_or_else(|e| panic!("write to {target} must be accepted, got {e:?}"));
    assert_eq!(
        sheet.get_cell(target),
        Value::Number(7.0),
        "{target} written"
    );
    assert_eq!(
        sheet.get_cell(anchor),
        Value::Error(ValueError::Spill),
        "{anchor} is the anchor the shifted bookkeeping named"
    );
    for f in freed {
        assert_eq!(
            sheet.get_cell(f),
            Value::Null,
            "{f} released with the array"
        );
    }
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(sheet.debug_spill_reverse_index_len(), 0);
}

/// Sheet with `=SEQUENCE(3)` at A1, spilled into A2:A3.
fn column_spill_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=SEQUENCE(3)"));
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0), "spill landed");
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0), "spill landed");
    sheet
}

/// Sheet with `=SEQUENCE(1,3)` at A1, spilled into B1:C1.
fn row_spill_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0), "spill landed");
    assert_eq!(sheet.get_cell("C1"), Value::Number(3.0), "spill landed");
    sheet
}

// =====================================================================
// A-4 — clear_range / BulkLoader spill awareness
// =====================================================================

/// Clearing a range that covers the anchor clears anchor + targets and
/// leaves the whole region empty and writable.
#[test]
fn clear_range_covering_anchor_clears_spill_cleanly() {
    let mut sheet = column_spill_sheet();
    let cleared = sheet.clear_range(range("A1", "A3"));
    assert_eq!(cleared, 3, "anchor + 2 targets visited");

    for a in ["A1", "A2", "A3"] {
        assert_eq!(sheet.get_cell(a), Value::Null, "{a} must be empty");
    }
    // Region is writable again — no read-only derived atoms left behind.
    assert!(sheet.try_set_cell("A2", Value::Number(5.0)).is_ok());
    assert_eq!(sheet.get_cell("A2"), Value::Number(5.0));
}

/// Clearing a range that touches ONLY non-anchor targets is a no-op for those
/// cells: the array stays intact. ADR 0006 stage 1 kept this — a `Value::Null`
/// write could never have blocked the spill, so collapsing would only
/// re-install the identical projection; Excel and `excel/excel-core-ts` treat
/// Delete over ghost cells as inert for exactly that reason. What CHANGED is
/// the reason: it is no longer a refusal, it is a fixpoint.
#[test]
fn clear_range_targets_only_is_noop_and_keeps_array() {
    let mut sheet = column_spill_sheet();
    sheet.clear_range(range("A2", "A3"));

    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0), "array intact");
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0), "array intact");
    assert!(
        matches!(sheet.get_cell("A1"), Value::Array(_)),
        "anchor still holds the array"
    );
}

/// A mixed range clears the plain cells and leaves the spill targets alone —
/// same Delete-is-inert rule as above.
#[test]
fn clear_range_partially_overlapping_spill_clears_only_plain_cells() {
    let mut sheet = column_spill_sheet();
    sheet.set_cell("B2", Value::Number(99.0));

    sheet.clear_range(range("A2", "B2"));

    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0), "target skipped");
    assert_eq!(sheet.get_cell("B2"), Value::Null, "plain cell cleared");
}

/// ADR 0006 stage 1 — SEMANTICS CHANGED. This used to pin
/// `bulk_set_cell_on_spill_target_is_skipped_without_panic`: the value was
/// silently dropped. It now lands and withdraws the array. The "without panic"
/// half of the old name is still the real risk being guarded — the write must
/// reach a fresh primitive atom, never the projection cell's read-only derived
/// one. Full semantics live in `spill_write_collapse.rs`.
#[test]
fn bulk_set_cell_on_spill_target_lands_and_collapses() {
    let mut sheet = column_spill_sheet();
    sheet.bulk_load(|loader| {
        loader.set_cell("A2", Value::Number(7.0));
    });
    assert_eq!(sheet.get_cell("A2"), Value::Number(7.0), "write landed");
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.get_cell("A3"), Value::Null, "array withdrawn");
}

/// ADR 0006 stage 1 — SEMANTICS CHANGED, was
/// `bulk_set_formula_on_spill_target_is_rejected_without_panic`. The `false`
/// return meant "rejected"; the formula is installed now, so it returns `true`.
#[test]
fn bulk_set_formula_on_spill_target_installs_and_collapses() {
    let mut sheet = column_spill_sheet();
    let installed = sheet.bulk_load(|loader| loader.set_formula("A2", "=1+1"));
    assert!(installed, "the formula is installed, not rejected");
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.get_cell("A3"), Value::Null, "array withdrawn");
}

/// BulkLoader::set_cell on the ANCHOR replaces the array (single-cell
/// parity: anchor overwrite tears the spill down first).
#[test]
fn bulk_set_cell_on_anchor_replaces_spill() {
    let mut sheet = column_spill_sheet();
    sheet.bulk_load(|loader| {
        loader.set_cell("A1", Value::Number(9.0));
    });
    assert_eq!(sheet.get_cell("A1"), Value::Number(9.0));
    assert_eq!(sheet.get_cell("A2"), Value::Null, "old target gone");
    assert_eq!(sheet.get_cell("A3"), Value::Null, "old target gone");
    assert!(sheet.try_set_cell("A3", Value::Number(1.0)).is_ok());
}

/// Bulk writes to a spill formula's dependency re-run the eager spill
/// maintenance at flush, exactly like the single-cell path does.
#[test]
fn bulk_dependency_write_recomputes_spill_at_flush() {
    let mut sheet = Sheet::new();
    sheet.set_cell("B1", Value::Number(3.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(B1)"));
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0), "3-row spill");

    sheet.bulk_load(|loader| {
        loader.set_cell("B1", Value::Number(2.0));
    });

    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0), "2-row spill");
    assert_eq!(
        sheet.get_cell("A3"),
        Value::Null,
        "shrunk spill released A3"
    );
    assert!(sheet.try_set_cell("A3", Value::Number(1.0)).is_ok());
}

// =====================================================================
// A-5 — structural edits × spill bookkeeping
// =====================================================================

/// insert_row above a spill: the whole spill shifts down and the
/// bookkeeping follows — a target write collapses the spill at the NEW anchor
/// address, and the NEW anchor accepts an overwrite.
#[test]
fn insert_row_above_spill_relocates_spill_bookkeeping() {
    let mut sheet = column_spill_sheet();
    sheet.insert_row(0, 1); // spill now at A2:A4 (anchor A2)

    assert_eq!(sheet.get_cell("A1"), Value::Null);
    assert_anchor_top_left(&sheet, "A2", 1.0);
    assert_eq!(sheet.get_cell("A3"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A4"), Value::Number(3.0));

    // Write to the real (shifted) bottom target: accepted, and it withdraws
    // the array anchored at the NEW address.
    assert_target_write_collapses_anchor(&mut sheet, "A4", "A2", &["A3"]);

    // Overwriting the shifted anchor is legal: replaces the array.
    assert!(sheet.try_set_cell("A2", Value::Number(9.0)).is_ok());
    assert_eq!(sheet.get_cell("A2"), Value::Number(9.0));
    assert_eq!(sheet.get_cell("A3"), Value::Null);
}

/// insert_row THROUGH the spill band: the anchor stays put and the
/// array re-spills contiguously below it (Excel: spill ranges never
/// split — the dynamic array re-flows after the edit).
#[test]
fn insert_row_through_spill_band_respills_contiguously() {
    let mut sheet = column_spill_sheet();
    sheet.insert_row(1, 1); // band between anchor (row 0) and targets

    assert_anchor_top_left(&sheet, "A1", 1.0);
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0));
    assert_eq!(sheet.get_cell("A4"), Value::Null);

    assert_target_write_collapses_anchor(&mut sheet, "A3", "A1", &["A2"]);
}

/// delete_row through the spill band: no panic, and the array re-flows
/// to its full extent from the surviving anchor.
#[test]
fn delete_row_through_spill_band_respills() {
    let mut sheet = column_spill_sheet();
    sheet.delete_row(1, 1); // deletes the row holding target A2

    assert_anchor_top_left(&sheet, "A1", 1.0);
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0));

    assert_target_write_collapses_anchor(&mut sheet, "A2", "A1", &["A3"]);
}

/// delete_row of the ANCHOR row collapses the spill entirely: formula
/// gone, all former targets empty and writable.
#[test]
fn delete_row_of_anchor_collapses_spill() {
    let mut sheet = column_spill_sheet();
    sheet.delete_row(0, 1);

    for a in ["A1", "A2", "A3"] {
        assert_eq!(sheet.get_cell(a), Value::Null, "{a} must be empty");
        assert!(sheet.try_set_cell(a, Value::Number(1.0)).is_ok());
    }
}

/// insert_col left of a row-wise spill: bookkeeping shifts right.
#[test]
fn insert_col_left_of_spill_relocates_spill_bookkeeping() {
    let mut sheet = row_spill_sheet();
    sheet.insert_col(0, 1); // spill now at B1:D1 (anchor B1)

    assert_eq!(sheet.get_cell("A1"), Value::Null);
    assert_anchor_top_left(&sheet, "B1", 1.0);
    assert_eq!(sheet.get_cell("C1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("D1"), Value::Number(3.0));

    assert_target_write_collapses_anchor(&mut sheet, "D1", "B1", &["C1"]);
    assert!(sheet.try_set_cell("B1", Value::Number(9.0)).is_ok());
}

/// delete_col through a row-wise spill band: no panic, re-spill from
/// the surviving anchor.
#[test]
fn delete_col_through_spill_band_respills() {
    let mut sheet = row_spill_sheet();
    sheet.delete_col(1, 1); // deletes column B (a target)

    assert_anchor_top_left(&sheet, "A1", 1.0);
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("C1"), Value::Number(3.0));

    assert_target_write_collapses_anchor(&mut sheet, "C1", "A1", &["B1"]);
}
