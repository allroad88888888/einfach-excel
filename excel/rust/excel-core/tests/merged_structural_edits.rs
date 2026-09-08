//! 合并区域随行列插删移动，结构历史还原原始矩形。
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn r(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn insertion_before_or_inside_a_merge_moves_or_expands_the_correct_axis() {
    for (edit, expected) in [
        (ShiftEdit::RowInsert { at: 1, count: 2 }, r("B4", "D6")),
        (ShiftEdit::RowInsert { at: 2, count: 2 }, r("B2", "D6")),
        (ShiftEdit::ColInsert { at: 1, count: 2 }, r("D2", "F4")),
        (ShiftEdit::ColInsert { at: 2, count: 2 }, r("B2", "F4")),
    ] {
        let mut wb = Workbook::new();
        wb.merge_cells(0, r("B2", "D4"), MergeAction::Merge, false)
            .unwrap();
        let mut history = WorkbookHistory::default();
        history.edit_structure(&mut wb, 0, edit).unwrap();
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[expected]);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[r("B2", "D4")]);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[expected]);
    }
}

#[test]
fn deletion_shrinks_a_partial_merge_and_removes_a_fully_deleted_or_single_cell_merge() {
    for (edit, expected) in [
        (
            ShiftEdit::RowDelete { at: 1, count: 1 },
            Some(r("B2", "D3")),
        ),
        (
            ShiftEdit::ColDelete { at: 2, count: 1 },
            Some(r("B2", "C4")),
        ),
        (ShiftEdit::RowDelete { at: 1, count: 3 }, None),
        (ShiftEdit::ColDelete { at: 1, count: 3 }, None),
    ] {
        let mut wb = Workbook::new();
        wb.merge_cells(0, r("B2", "D4"), MergeAction::Merge, false)
            .unwrap();
        let mut history = WorkbookHistory::default();
        history.edit_structure(&mut wb, 0, edit).unwrap();
        assert_eq!(
            wb.sheet(0).unwrap().merged_ranges(),
            expected.into_iter().collect::<Vec<_>>()
        );
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[r("B2", "D4")]);
    }
    let mut wb = Workbook::new();
    wb.merge_cells(0, r("A1", "B1"), MergeAction::Merge, false)
        .unwrap();
    wb.try_structural_edit(0, ShiftEdit::ColDelete { at: 1, count: 1 })
        .unwrap();
    assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
}

#[test]
fn insertion_cannot_push_an_empty_merge_outside_the_excel_limit() {
    let mut wb = Workbook::new();
    wb.merge_cells(0, r("A1048575", "B1048576"), MergeAction::Merge, false)
        .unwrap();
    assert!(wb
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(
        wb.sheet(0).unwrap().merged_ranges(),
        &[r("A1048575", "B1048576")]
    );
}

#[test]
fn projection_returns_full_merge_when_its_anchor_is_outside_the_window() {
    let mut wb = Workbook::new();
    wb.merge_cells(0, r("A1", "Z100"), MergeAction::Merge, false)
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(
        sheet.merges_in_range(r("D40", "E50")),
        vec![r("A1", "Z100")]
    );
    assert_eq!(
        sheet.merged_range_at(CellAddress::parse("Z100").unwrap()),
        Some(r("A1", "Z100"))
    );
    assert!(sheet.merges_in_range(r("AA1", "AB5")).is_empty());
}
