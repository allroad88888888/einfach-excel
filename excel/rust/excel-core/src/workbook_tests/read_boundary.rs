//! Public read boundaries must settle their own pending entries.
//!
//! A bare Store read parks every newly-computed state in `pending`. Draining
//! that queue is what `flush_pending` does on the NEXT mutation, and it costs
//! one `dependencies_change` walk per parked entry. So a read path that does
//! not settle silently bills its whole cost to whoever writes next — which in
//! the projection's case was the user's first edit after a bulk import.

use super::*;

/// Rows of data behind the whole-column aggregate. Big enough that an
/// unsettled read would dominate the write's flush, small enough to stay fast.
const ROWS: u32 = 2_000;

/// A sheet shaped like the excel-site performance seed: a block of imported
/// data plus one aggregate over the whole block.
fn seeded_workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.bulk_load(|loader| {
        for row in 3..(3 + ROWS) {
            loader.set_cell(0, &format!("A{row}"), Value::Number((row % 500) as f64));
        }
        let last = 3 + ROWS - 1;
        loader.set_formula(0, "A1", &format!("=SUM(A3:A{last})"));
    });
    wb
}

/// Flush visits charged to a single unrelated write, measured right after the
/// projection has read the range. `Z1` is outside every formula's range, so a
/// settled store owes this write nothing.
fn visits_for_write_after_projection_read(wb: &mut Workbook) -> usize {
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(3 + ROWS, 0));
    wb.for_each_sparse_range_cell(0, range, |_, _| {});

    let before = wb.store.debug_flush_visit_count();
    wb.try_set_cell(0, "Z1", Value::Number(1.0)).expect("write");
    wb.store.debug_flush_visit_count() - before
}

#[test]
fn sparse_range_read_settles_so_the_next_write_is_not_billed_for_it() {
    let mut wb = seeded_workbook();
    let visits = visits_for_write_after_projection_read(&mut wb);

    // The write touches one cell nothing depends on. Before the fix this
    // number tracked the whole imported block (~ROWS), because the read left
    // every hydrated primitive parked in `pending` for this flush to walk.
    assert!(
        visits < 100,
        "a single unrelated write inherited {visits} flush visits from an \
         unsettled projection read (ROWS = {ROWS}); the read boundary must \
         call settle_pending_reads"
    );
}

#[test]
fn projection_read_leaves_no_debt_for_a_later_write_either() {
    let mut wb = seeded_workbook();
    // Warm: first write already paid whatever was owed.
    let _ = visits_for_write_after_projection_read(&mut wb);
    // A second projection read parks nothing new, so the next write stays
    // cheap too — this is the property that made the bug look intermittent
    // ("only the FIRST edit hangs").
    let visits = visits_for_write_after_projection_read(&mut wb);
    assert!(visits < 100, "second write inherited {visits} flush visits");
}

#[test]
fn sparse_range_read_still_returns_evaluated_formula_values() {
    let wb = seeded_workbook();
    let mut aggregate = Value::Null;
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 0));
    wb.for_each_sparse_range_cell(0, range, |addr, value| {
        if addr == CellAddress::new(0, 0) {
            aggregate = value;
        }
    });
    let expected: f64 = (3..(3 + ROWS)).map(|row| (row % 500) as f64).sum();
    assert_eq!(aggregate, Value::Number(expected));
}
