//! ADR 0006 stage 1 — a write INTO a dynamic array's spill region lands, and
//! the array withdraws.
//!
//! `docs/decisions/0006-spill-region-write-semantics.md`. The engine used to
//! REFUSE such a write (`SheetError::SpillCellWrite`). The ADR's archaeology
//! showed the refusal was never a semantic decision — it existed so
//! `store.set` could not land on a spill projection cell's read-only derived
//! atom and panic — and that `clear_spill` had offered the correct fix
//! (withdraw first, then write) all along.
//!
//! Target semantics, matching Excel and this repo's reference engine
//! (`excel/excel-core-ts/test/workbook.test.ts:287` is the oracle):
//!
//!   * writing CONTENT into a projection cell lands, the whole array is
//!     withdrawn, and the anchor projects `#SPILL!`;
//!   * pressing Delete over a projection cell does nothing at all — the one
//!     case where "Excel ignores it" really is Excel's rule.
//!
//! Stage 2 (the array coming BACK once the obstruction goes away) is the
//! sibling file `spill_write_revive.rs`.
//!
//! Explicit non-goal (ADR 0006 § "明确非目标"): sorting and auto-fill keep
//! refusing WHOLESALE when they would cross a dynamic array's boundary, because
//! Excel refuses those too ("You can't change part of an array") and
//! single-cell input is its only exception. Those refusals are pinned by the
//! in-module tests at `src/sort.rs` (`SpillIntersectsRange`) and
//! `src/auto_fill.rs` (`SpillTarget`); do not "finish" ADR 0006 by relaxing
//! them.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use einfach_core::{ArrayData, Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Sheet, Workbook};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end)).normalize()
}

/// `=SEQUENCE(4)` at H1, spilled into H2:H4.
fn column_spill_sheet() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("H1", "=SEQUENCE(4)"));
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "spill landed");
    sheet
}

/// Assert the array is gone: anchor at `#SPILL!`, every projection cell but
/// `written` back to empty, and the spill bookkeeping empty.
fn assert_collapsed(sheet: &Sheet, anchor: &str, ghosts: &[&str]) {
    assert_eq!(
        sheet.get_cell(anchor),
        Value::Error(ValueError::Spill),
        "{anchor} must project #SPILL! after the write"
    );
    for g in ghosts {
        assert_eq!(
            sheet.get_cell(g),
            Value::Null,
            "{g} must be empty — the whole array is withdrawn, not just the written cell"
        );
    }
    assert_eq!(sheet.spill_info(addr(anchor)), None, "no shape any more");
    assert_eq!(sheet.debug_spill_anchor_count(), 0);
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(sheet.debug_spill_reverse_index_len(), 0);
}

// =====================================================================
// Stage 1 — the write lands and the array withdraws
// =====================================================================

/// The headline case, and the reversal of the old
/// `write_to_spilled_cell_rejected`.
#[test]
fn literal_into_projection_cell_lands_and_collapses_the_array() {
    let mut sheet = column_spill_sheet();

    sheet
        .try_set_cell("H3", Value::Number(999.0))
        .expect("ADR 0006: the write is accepted, not refused");

    assert_eq!(sheet.get_cell("H3"), Value::Number(999.0), "write landed");
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// Same for a formula, reversing `write_formula_to_spilled_cell_rejected`.
/// A formula ALWAYS blocks a spill, so there is no inert case here.
#[test]
fn formula_into_projection_cell_lands_and_collapses_the_array() {
    let mut sheet = column_spill_sheet();

    assert_eq!(
        sheet.try_set_formula("H3", "=1+1"),
        Ok(true),
        "ADR 0006: the formula installs"
    );

    assert_eq!(sheet.get_cell("H3"), Value::Number(2.0));
    assert_eq!(sheet.get_formula("H3").as_deref(), Some("=1+1"));
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// The middle of a 2-D spill, so the collapse cannot be an artefact of
/// column geometry or of the write landing on the last projection cell.
#[test]
fn literal_into_the_middle_of_a_2d_spill_collapses_the_whole_rectangle() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("B2", "=SEQUENCE(3,3)"));
    assert_eq!(sheet.get_cell("C3"), Value::Number(5.0), "spill landed");

    sheet
        .try_set_cell("C3", Value::Text("x".into()))
        .expect("write accepted");

    assert_eq!(sheet.get_cell("C3"), Value::Text("x".into()));
    assert_collapsed(&sheet, "B2", &["C2", "D2", "B3", "D3", "B4", "C4", "D4"]);
}

/// A write into a projection cell of a NON-formula anchor (`set_array`, the
/// debug entry point) collapses too. There is no formula to re-run, so the
/// `#SPILL!` projection has to be written by the collapse itself — this is the
/// one place the ADR's "reuse `recompute_array_formula`" reuse argument does
/// not apply.
#[test]
fn literal_into_a_set_array_projection_cell_still_collapses() {
    let mut sheet = Sheet::new();
    sheet
        .set_array(
            "A1",
            Arc::new(ArrayData::new(
                3,
                1,
                vec![
                    Value::Number(10.0),
                    Value::Number(20.0),
                    Value::Number(30.0),
                ],
            )),
        )
        .unwrap();
    assert_eq!(sheet.get_cell("A2"), Value::Number(20.0));

    sheet
        .try_set_cell("A2", Value::Number(7.0))
        .expect("accepted");

    assert_eq!(sheet.get_cell("A2"), Value::Number(7.0));
    assert_collapsed(&sheet, "A1", &["A3"]);
}

/// `set_array` aimed INTO another anchor's region: `Value::Array` is content
/// like any other, so it collapses the host spill and installs its own.
#[test]
fn set_array_into_a_projection_cell_collapses_the_host_spill() {
    let mut sheet = column_spill_sheet();

    sheet
        .set_array(
            "H3",
            Arc::new(ArrayData::new(
                2,
                1,
                vec![Value::Number(100.0), Value::Number(200.0)],
            )),
        )
        .expect("accepted");

    assert_eq!(
        sheet.get_cell("H1"),
        Value::Error(ValueError::Spill),
        "the host array withdrew"
    );
    match sheet.get_cell("H3") {
        Value::Array(a) => assert_eq!(a.shape(), (2, 1)),
        other => panic!("H3 must now be its own anchor, got {other:?}"),
    }
    assert_eq!(sheet.get_cell("H4"), Value::Number(200.0), "its projection");
}

/// ONE notification wave. A collapse is three store-visible steps — withdraw
/// the projection, land the write, re-project the anchor as `#SPILL!` — and the
/// state between step 1 and step 3 is one no user ever authored: the projection
/// cells already empty while the anchor still holds its array. A formula
/// spanning both, like the `=COUNT(H1:H4)` here, is exactly what can SEE that
/// interim, and it would publish a value (3) that corresponds to no reachable
/// sheet state.
///
/// The single-cell write paths therefore wrap the whole sequence in an outer
/// `store_batch` — batches nest, only the outermost flushes — so K1 is told
/// once and reads the settled answer. Removing that wrapper makes this test
/// count 2 (verified by removing it); the anchor and the projection cells
/// themselves fire once either way, which is why the witness has to be a cell
/// that reads across the boundary.
#[test]
fn collapse_publishes_one_notification_wave() {
    let mut sheet = column_spill_sheet();
    assert!(sheet.set_formula("K1", "=COUNT(H1:H4)"));
    assert_eq!(sheet.get_cell("K1"), Value::Number(4.0));

    let fires = Rc::new(RefCell::new(Vec::<String>::new()));
    let mut subs = Vec::new();
    for cell in ["H1", "H2", "K1"] {
        let f = Rc::clone(&fires);
        let name = cell.to_string();
        subs.push(sheet.subscribe_cell(cell, move || f.borrow_mut().push(name.clone())));
    }

    sheet.try_set_cell("H3", Value::Number(999.0)).unwrap();

    let fired = fires.borrow().clone();
    assert_eq!(
        fired.iter().filter(|c| *c == "K1").count(),
        1,
        "K1 spans the anchor and its projection cells; it must never see the \
         array-still-there-but-projection-gone interim. Fired: {fired:?}"
    );
    assert_eq!(fired.iter().filter(|c| *c == "H1").count(), 1);
    assert_eq!(fired.iter().filter(|c| *c == "H2").count(), 1);
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.get_cell("K1"),
        Value::Number(1.0),
        "only the literal at H3 is left in H1:H4"
    );
}

// =====================================================================
// Stage 1 — Delete over a projection cell stays inert
// =====================================================================

/// The one behaviour the pre-ADR code got right, kept deliberately. A
/// `Value::Null` write could never have blocked the spill, so collapsing would
/// only re-install the identical projection: the no-op is the FIXPOINT of the
/// stage 1 rule, not an exception to it. Excel and `excel-core-ts`
/// (`workbook.ts` § "Spill semantics") agree.
#[test]
fn delete_over_a_projection_cell_is_inert() {
    let mut sheet = column_spill_sheet();

    sheet.try_clear_cell("H3").expect("clear is accepted");
    sheet
        .try_set_cell("H2", Value::Null)
        .expect("an explicit Null write is the same thing");

    assert_eq!(sheet.get_cell("H2"), Value::Number(2.0), "array intact");
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "array intact");
    assert!(matches!(sheet.get_cell("H1"), Value::Array(_)));
    assert_eq!(sheet.debug_spill_target_count(), 3);
}

/// The inert path must not release the projection cell's atom even when the
/// array element it holds happens to BE `Value::Null` — that is the case where
/// `try_release_primitive`'s "this Null primitive is unused" test would
/// otherwise destroy a live derived atom.
#[test]
fn delete_over_a_projection_cell_holding_null_does_not_release_the_atom() {
    let mut sheet = Sheet::new();
    sheet
        .set_array(
            "A1",
            Arc::new(ArrayData::new(
                3,
                1,
                vec![Value::Number(1.0), Value::Null, Value::Number(3.0)],
            )),
        )
        .unwrap();
    assert_eq!(sheet.get_cell("A2"), Value::Null, "the element IS null");
    let targets_before = sheet.debug_spill_target_count();

    sheet.try_clear_cell("A2").expect("clear is accepted");

    assert_eq!(sheet.debug_spill_target_count(), targets_before);
    assert_eq!(sheet.debug_spill_reverse_index_len(), targets_before);
    assert_eq!(sheet.get_cell("A3"), Value::Number(3.0), "array intact");
}

// =====================================================================
// Stage 1 — the bulk paths
// =====================================================================

/// `BulkLoader::set_cell` used to skip a projection cell silently. It now
/// collapses, and the anchor's `#SPILL!` is delivered by `flush` — the bulk
/// path cannot reach the anchor through Store reverse dependencies either.
#[test]
fn bulk_literal_into_projection_cell_collapses_at_flush() {
    let mut sheet = column_spill_sheet();

    sheet.bulk_load(|loader| {
        loader.set_cell("H3", Value::Number(7.0));
    });

    assert_eq!(sheet.get_cell("H3"), Value::Number(7.0));
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// Same for `BulkLoader::set_formula`, which also has to start returning
/// `true`: the formula really is installed now.
#[test]
fn bulk_formula_into_projection_cell_installs_and_collapses() {
    let mut sheet = column_spill_sheet();

    let installed = sheet.bulk_load(|loader| loader.set_formula("H3", "=1+1"));

    assert!(installed, "the formula is installed, not rejected");
    assert_eq!(sheet.get_cell("H3"), Value::Number(2.0));
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// `Workbook::bulk_load` reaches `set_formula_lazy` through
/// `set_formula_pre_parsed`, a third entry point with its own copy of the
/// guard. Leaving it un-collapsed is what would have made `store.set` panic on
/// a read-only derived atom.
#[test]
fn workbook_bulk_load_formula_into_projection_cell_collapses() {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "H1", "=SEQUENCE(4)"));
    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Number(3.0));

    wb.bulk_load(|loader| {
        loader.set_formula(0, "H3", "=1+1");
    });

    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "H1"), Value::Error(ValueError::Spill));
    assert_eq!(wb.get_cell("Sheet1", "H2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "H4"), Value::Null);
}

/// `clear_range` over part of a spill region routes through
/// `BulkLoader::set_cell_at` with `Value::Null`, so it inherits the inert
/// Delete rule: plain cells clear, the array survives. The count still
/// reports every non-empty address the sparse scan VISITED, which at the
/// Rust layer includes projection cells.
#[test]
fn clear_range_over_part_of_a_spill_leaves_the_array_intact() {
    let mut sheet = column_spill_sheet();
    sheet.set_cell("I3", Value::Number(99.0));

    sheet.clear_range(range("H3", "I3"));

    assert_eq!(sheet.get_cell("I3"), Value::Null, "plain cell cleared");
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "array intact");
    assert!(matches!(sheet.get_cell("H1"), Value::Array(_)));
}

/// But a range that clears the ANCHOR still tears everything down, and the
/// region is writable afterwards.
#[test]
fn clear_range_over_the_anchor_still_tears_the_spill_down() {
    let mut sheet = column_spill_sheet();

    sheet.clear_range(range("H1", "H4"));

    for a in ["H1", "H2", "H3", "H4"] {
        assert_eq!(sheet.get_cell(a), Value::Null, "{a} must be empty");
    }
    assert!(sheet.try_set_cell("H3", Value::Number(5.0)).is_ok());
    assert_eq!(sheet.get_cell("H3"), Value::Number(5.0));
}
