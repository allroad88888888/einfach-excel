use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::Sheet;
use crate::workbook::Workbook;
use einfach_core::ArrayData;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use super::addr;
use super::asc;
use super::col_values;
use super::num;
use super::range;
use super::super::{SortRangeError, SortRangeReport};
use super::text;

#[test]
fn spill_anchor_inside_range_rejects() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    let arr = Arc::new(ArrayData::new(2, 1, vec![num(7.0), num(8.0)]));
    sheet.set_array("A2", arr).unwrap();

    let err = sheet
        .sort_range(range("A1", "A3"), &[asc(0)], &[])
        .unwrap_err();
    assert_eq!(
        err,
        SortRangeError::SpillIntersectsRange { anchor: addr("A2") }
    );
    // Nothing moved.
    assert_eq!(sheet.get_cell("A1"), num(2.0));
}

#[test]
fn spill_target_only_intersection_rejects_with_anchor() {
    let mut sheet = Sheet::new();
    let arr = Arc::new(ArrayData::new(3, 1, vec![num(1.0), num(2.0), num(3.0)]));
    sheet.set_array("A5", arr).unwrap(); // spills A5:A7
    sheet.set_cell("A8", num(9.0));

    // Range touches only the target A7, not the anchor.
    let err = sheet
        .sort_range(range("A7", "A9"), &[asc(0)], &[])
        .unwrap_err();
    assert_eq!(
        err,
        SortRangeError::SpillIntersectsRange { anchor: addr("A5") }
    );
}

#[test]
fn spill_outside_range_does_not_block_sort() {
    let mut sheet = Sheet::new();
    let arr = Arc::new(ArrayData::new(2, 1, vec![num(1.0), num(2.0)]));
    sheet.set_array("D1", arr).unwrap(); // spills D1:D2, outside cols A..B
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));

    sheet.sort_range(range("A1", "B2"), &[asc(0)], &[]).unwrap();
    assert_eq!(col_values(&sheet, "A", 2), vec![num(1.0), num(2.0)]);
    // Spill intact.
    assert_eq!(sheet.get_cell("D2"), num(2.0));
}

#[test]
fn empty_keys_rejected() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(1.0));
    assert_eq!(
        sheet.sort_range(range("A1", "A2"), &[], &[]),
        Err(SortRangeError::EmptyKeys)
    );
}

#[test]
fn key_outside_range_columns_rejected() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(1.0));
    assert_eq!(
        sheet.sort_range(range("A1", "B2"), &[asc(5)], &[]),
        Err(SortRangeError::KeyOutOfRange)
    );
}

#[test]
fn range_past_excel_grid_rejected() {
    let mut sheet = Sheet::new();
    let bad = CellRange::new(CellAddress::new(0, 0), CellAddress::new(2_000_000, 0));
    assert_eq!(
        sheet.sort_range(bad, &[asc(0)], &[]),
        Err(SortRangeError::InvalidRange)
    );
}

// === No-op, row heights, outside cells, notifications ===

#[test]
fn noop_sort_writes_nothing_and_notifies_nobody() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(1.0));
    sheet.set_cell("A2", num(2.0));
    let fires = Rc::new(RefCell::new(0));
    for a in ["A1", "A2"] {
        let f = fires.clone();
        sheet.subscribe_cell(a, move || *f.borrow_mut() += 1);
    }

    let report = sheet.sort_range(range("A1", "A2"), &[asc(0)], &[]).unwrap();
    assert_eq!(report, SortRangeReport::default());
    assert_eq!(*fires.borrow(), 0);
}

#[test]
fn row_heights_do_not_move_with_sorted_rows() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_row_height(0, 42);
    sheet.set_row_height(1, 7);

    sheet.sort_range(range("A1", "A2"), &[asc(0)], &[]).unwrap();
    // Rows swapped, heights stayed (Excel behavior).
    assert_eq!(sheet.get_cell("A1"), num(1.0));
    assert_eq!(sheet.row_height(0), Some(42));
    assert_eq!(sheet.row_height(1), Some(7));
}

#[test]
fn cells_outside_range_are_untouched_and_only_changed_cells_notify() {
    let mut sheet = Sheet::new();
    // A1 keeps its value (already minimal); A2/A3 swap.
    sheet.set_cell("A1", num(1.0));
    sheet.set_cell("A2", num(3.0));
    sheet.set_cell("A3", num(2.0));
    sheet.set_cell("D1", num(99.0)); // outside

    let unchanged = Rc::new(RefCell::new(0));
    let changed = Rc::new(RefCell::new(0));
    let outside = Rc::new(RefCell::new(0));
    {
        let c = unchanged.clone();
        sheet.subscribe_cell("A1", move || *c.borrow_mut() += 1);
    }
    {
        let c = changed.clone();
        sheet.subscribe_cell("A2", move || *c.borrow_mut() += 1);
    }
    {
        let c = outside.clone();
        sheet.subscribe_cell("D1", move || *c.borrow_mut() += 1);
    }

    let report = sheet.sort_range(range("A1", "A3"), &[asc(0)], &[]).unwrap();
    assert_eq!(report.moved_rows, 2);
    assert_eq!(report.row_permutation, vec![(1, 2), (2, 1)]);
    assert_eq!(sheet.get_cell("D1"), num(99.0));
    assert_eq!(*unchanged.borrow(), 0, "value-stable slot must not fire");
    assert_eq!(*changed.borrow(), 1, "changed slot fires exactly once");
    assert_eq!(*outside.borrow(), 0, "outside the range must not fire");
}

#[test]
fn moved_cells_counts_content_cells_in_moved_rows_only() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(1.0)); // stays (slot 0 keeps row 0)
    sheet.set_cell("B1", text("stay"));
    sheet.set_cell("A2", num(3.0));
    sheet.set_cell("A3", num(2.0));
    sheet.set_cell("B3", text("move"));

    let report = sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    // Rows 1 and 2 move; content cells there: A2, A3, B3.
    assert_eq!(report.moved_rows, 2);
    assert_eq!(report.moved_cells, 3);
}

// === Workbook entry point ===

#[test]
fn workbook_sort_range_delegates_and_validates_sheet_index() {
    let mut wb = Workbook::new();
    let s0 = wb.add_sheet("Sheet1");
    let s1 = wb.add_sheet("Sheet2");
    wb.set_cell(s0, "A1", num(2.0));
    wb.set_cell(s0, "A2", num(1.0));
    // Cross-sheet observer on the other sheet.
    assert!(wb.set_formula(s1, "A1", "=Sheet1!A1"));
    assert_eq!(wb.get_cell("Sheet2", "A1"), num(2.0));

    let report = wb
        .sort_range(s0, range("A1", "A2"), &[asc(0)], &[])
        .unwrap();
    assert_eq!(report.moved_rows, 2);
    assert_eq!(wb.get_cell("Sheet1", "A1"), num(1.0));
    // Cross-sheet formula recomputes through the shared store.
    assert_eq!(wb.get_cell("Sheet2", "A1"), num(1.0));

    assert_eq!(
        wb.sort_range(99, range("A1", "A2"), &[asc(0)], &[]),
        Err(SortRangeError::InvalidRange)
    );
}
