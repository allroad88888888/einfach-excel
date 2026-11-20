use crate::sheet::Sheet;
use einfach_core::Value;
use einfach_core::ValueError;
use super::asc;
use super::col_values;
use super::desc;
use super::num;
use super::range;
use super::super::SortRangeReport;
use super::text;

#[test]
fn ascending_sort_moves_rows_and_reports_permutation() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(3.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(2.0));
    sheet.set_cell("B1", text("three"));
    sheet.set_cell("B2", text("one"));
    sheet.set_cell("B3", text("two"));

    let report = sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    assert_eq!(report.moved_rows, 3);
    assert_eq!(report.moved_cells, 6);
    // Slot ← previous occupant: slot 0 ← row 1, slot 1 ← row 2, slot 2 ← row 0.
    assert_eq!(report.row_permutation, vec![(0, 1), (1, 2), (2, 0)]);

    assert_eq!(
        col_values(&sheet, "A", 3),
        vec![num(1.0), num(2.0), num(3.0)]
    );
    assert_eq!(
        col_values(&sheet, "B", 3),
        vec![text("one"), text("two"), text("three")]
    );
}

#[test]
fn descending_sort_with_empty_rows_sinking() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(1.0));
    // A2 empty.
    sheet.set_cell("A3", num(2.0));
    sheet.set_cell("A4", num(3.0));

    sheet
        .sort_range(range("A1", "A4"), &[desc(0)], &[])
        .unwrap();
    // Descending numbers first, empty row sinks to the last slot.
    assert_eq!(
        col_values(&sheet, "A", 4),
        vec![num(3.0), num(2.0), num(1.0), Value::Null]
    );
}

#[test]
fn empty_rows_sink_ascending_data_compacts() {
    let mut sheet = Sheet::new();
    // Row 2 and 4 empty; data on 1, 3, 5.
    sheet.set_cell("A1", num(30.0));
    sheet.set_cell("A3", num(10.0));
    sheet.set_cell("A5", num(20.0));

    sheet.sort_range(range("A1", "A5"), &[asc(0)], &[]).unwrap();
    assert_eq!(
        col_values(&sheet, "A", 5),
        vec![num(10.0), num(20.0), num(30.0), Value::Null, Value::Null]
    );
}

#[test]
fn stable_sort_preserves_slot_order_of_equal_keys() {
    let mut sheet = Sheet::new();
    // Keys: 2, 1, 2, 1 — payload marks original order.
    for (i, (k, p)) in [(2.0, "b1"), (1.0, "b2"), (2.0, "b3"), (1.0, "b4")]
        .iter()
        .enumerate()
    {
        sheet.set_cell(&format!("A{}", i + 1), num(*k));
        sheet.set_cell(&format!("B{}", i + 1), text(p));
    }
    sheet.sort_range(range("A1", "B4"), &[asc(0)], &[]).unwrap();
    assert_eq!(
        col_values(&sheet, "B", 4),
        vec![text("b2"), text("b4"), text("b1"), text("b3")]
    );
}

#[test]
fn resorting_sorted_data_is_noop_and_stable() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(1.0));
    sheet.set_cell("B1", text("x"));
    sheet.set_cell("B2", text("first"));
    sheet.set_cell("B3", text("second"));

    let first = sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    assert!(first.moved_rows > 0);
    let second = sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    assert_eq!(second, SortRangeReport::default());
    assert_eq!(
        col_values(&sheet, "B", 3),
        vec![text("first"), text("second"), text("x")]
    );
}

#[test]
fn multi_key_secondary_direction_applied_per_key() {
    let mut sheet = Sheet::new();
    // Groups in A (asc), tiebreak B (desc).
    let rows = [(2.0, 1.0), (1.0, 5.0), (2.0, 9.0), (1.0, 7.0)];
    for (i, (a, b)) in rows.iter().enumerate() {
        sheet.set_cell(&format!("A{}", i + 1), num(*a));
        sheet.set_cell(&format!("B{}", i + 1), num(*b));
    }
    sheet
        .sort_range(range("A1", "B4"), &[asc(0), desc(1)], &[])
        .unwrap();
    assert_eq!(
        col_values(&sheet, "A", 4),
        vec![num(1.0), num(1.0), num(2.0), num(2.0)]
    );
    assert_eq!(
        col_values(&sheet, "B", 4),
        vec![num(7.0), num(5.0), num(9.0), num(1.0)]
    );
}

#[test]
fn mixed_type_column_sorts_by_class() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Boolean(true));
    sheet.set_cell("A2", text("zebra"));
    sheet.set_formula("A3", "=1/0");
    sheet.set_cell("A4", num(99.0));
    // A5 empty.
    sheet.set_cell("A6", Value::Boolean(false));

    sheet.sort_range(range("A1", "A6"), &[asc(0)], &[]).unwrap();
    let got = col_values(&sheet, "A", 6);
    assert_eq!(got[0], num(99.0));
    assert_eq!(got[1], text("zebra"));
    assert_eq!(got[2], Value::Boolean(false));
    assert_eq!(got[3], Value::Boolean(true));
    assert_eq!(got[4], Value::Error(ValueError::DivisionByZero));
    assert_eq!(got[5], Value::Null);
}

// === Excluded rows ===

#[test]
fn excluded_rows_stay_in_place_and_do_not_compare() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(4.0));
    sheet.set_cell("A2", text("PINNED")); // excluded — would sort last if compared
    sheet.set_cell("A3", num(2.0));
    sheet.set_cell("A4", num(1.0));

    let report = sheet
        .sort_range(range("A1", "A4"), &[asc(0)], &[1])
        .unwrap();
    // Visible slots 0, 2, 3 with keys 4, 2, 1 → 1, 2, 4.
    assert_eq!(
        col_values(&sheet, "A", 4),
        vec![num(1.0), text("PINNED"), num(2.0), num(4.0)]
    );
    // Permutation touches visible slots only.
    assert!(report
        .row_permutation
        .iter()
        .all(|&(slot, src)| slot != 1 && src != 1));
}

#[test]
fn excluded_rows_outside_range_are_ignored_and_deduped() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    let report = sheet
        .sort_range(range("A1", "A2"), &[asc(0)], &[999, 999, 7])
        .unwrap();
    assert_eq!(report.moved_rows, 2);
    assert_eq!(col_values(&sheet, "A", 2), vec![num(1.0), num(2.0)]);
}

#[test]
fn excluding_every_row_is_a_noop() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    let report = sheet
        .sort_range(range("A1", "A2"), &[asc(0)], &[0, 1])
        .unwrap();
    assert_eq!(report, SortRangeReport::default());
    assert_eq!(col_values(&sheet, "A", 2), vec![num(2.0), num(1.0)]);
}

#[test]
fn empty_excluded_set_reorders_whole_segment() {
    let mut sheet = Sheet::new();
    for (i, v) in [5.0, 4.0, 3.0, 2.0, 1.0].iter().enumerate() {
        sheet.set_cell(&format!("A{}", i + 1), num(*v));
    }
    sheet.sort_range(range("A1", "A5"), &[asc(0)], &[]).unwrap();
    assert_eq!(
        col_values(&sheet, "A", 5),
        vec![num(1.0), num(2.0), num(3.0), num(4.0), num(5.0)]
    );
}

// === Formulas: verbatim relocation, dependency recompute ===

#[test]
fn hydrated_formula_moves_verbatim_and_reevaluates_at_new_slot() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(3.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(2.0));
    sheet.set_formula("B1", "=A1*10");
    // Hydrate before the sort.
    assert_eq!(sheet.get_cell("B1"), num(30.0));

    sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    // Row 0 (key 3) moved to slot 2. Formula text is untouched
    // (verbatim — still "=A1*10") and now reads the NEW A1.
    assert_eq!(sheet.get_formula("B3"), Some("=A1*10".to_string()));
    assert_eq!(sheet.get_cell("B3"), num(10.0));
    assert_eq!(sheet.get_formula("B1"), None);
}

#[test]
fn parked_formula_source_moves_verbatim_without_hydration() {
    let mut sheet = Sheet::new();
    // Park a lazy formula in the non-key column via bulk_load.
    sheet.bulk_load(|loader| {
        loader.set_cell("A1", num(2.0));
        loader.set_cell("A2", num(1.0));
        loader.set_formula("B1", "=A2+100");
    });

    sheet.sort_range(range("A1", "B2"), &[asc(0)], &[]).unwrap();
    // Parked source rode along verbatim to row 1.
    assert_eq!(sheet.get_formula("B2"), Some("=A2+100".to_string()));
    // First read hydrates at the new location: A2 now holds 2.
    assert_eq!(sheet.get_cell("B2"), num(102.0));
}

#[test]
fn outside_formula_reading_sorted_cell_recomputes() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(3.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(2.0));
    sheet.set_formula("D1", "=A1"); // outside the sorted range
    assert_eq!(sheet.get_cell("D1"), num(3.0));

    sheet.sort_range(range("A1", "A3"), &[asc(0)], &[]).unwrap();
    // Physical move: D1's reference is NOT adjusted; it reads the new
    // occupant of A1.
    assert_eq!(sheet.get_formula("D1"), Some("=A1".to_string()));
    assert_eq!(sheet.get_cell("D1"), num(1.0));
}

#[test]
fn in_range_formula_keeps_pointing_at_original_address() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_formula("B1", "=A1"); // references inside the range
    assert_eq!(sheet.get_cell("B1"), num(2.0));

    sheet.sort_range(range("A1", "B2"), &[asc(0)], &[]).unwrap();
    // Formula moved to row 1; still reads A1 (verbatim, no offset
    // preservation — recorded conformance divergence from Excel).
    assert_eq!(sheet.get_formula("B2"), Some("=A1".to_string()));
    assert_eq!(sheet.get_cell("B2"), num(1.0));
}
