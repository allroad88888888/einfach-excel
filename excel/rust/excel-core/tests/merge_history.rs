//! 合并三种动作的原生内容、格式、确认与历史语义。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    Align, CellAddress, CellRange, CellStyle, MergeAction, StyleScope, Workbook,
};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn confirmation_is_required_before_content_or_format_changes() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Keep".into()));
    wb.set_cell(0, "B1", Value::Number(0.0));
    wb.set_formula(0, "C1", "=B1+2");
    let mut history = WorkbookHistory::default();
    let result = history.merge_cells(&mut wb, 0, range("A1", "C1"), MergeAction::Center, false);
    assert_eq!(result, Err("MERGE_CONTENT_CONFIRMATION_REQUIRED"));
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(0.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=B1+2")
    );
    assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
    assert_ne!(
        wb.sheet(0).unwrap().effective_format("A1").align,
        Align::Center
    );
}

#[test]
fn merge_and_center_is_one_undo_step_restoring_exact_values_and_styles() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=4+3");
    wb.set_cell(0, "B1", Value::Text("Discard after confirmation".into()));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let original = wb.sheet(0).unwrap().effective_format("A1");
    let summary = wb.add_sheet("Summary");
    wb.set_formula(summary, "A1", "=Sheet1!A1");
    let mut history = WorkbookHistory::default();
    assert!(history
        .merge_cells(&mut wb, 0, range("A1", "C2"), MergeAction::Center, true)
        .unwrap());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
    assert!(wb.sheet(0).unwrap().effective_format("A1").bold);
    assert_eq!(
        wb.sheet(0).unwrap().effective_format("A1").align,
        Align::Center
    );
    for _ in 0..3 {
        assert!(history.undo(&mut wb).unwrap());
        assert_eq!(
            wb.get_cell("Sheet1", "B1"),
            Value::Text("Discard after confirmation".into())
        );
        assert_eq!(wb.sheet(0).unwrap().effective_format("A1"), original);
        assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=4+3")
        );
        assert!(history.redo(&mut wb).unwrap());
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "C2")]);
        assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
    }
}

#[test]
fn unmerge_keeps_only_anchor_content_and_undo_restores_the_merge() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(4.0));
    wb.set_cell(0, "B1", Value::Number(8.0));
    let mut history = WorkbookHistory::default();
    history
        .merge_cells(&mut wb, 0, range("A1", "B2"), MergeAction::Merge, true)
        .unwrap();
    history
        .merge_cells(&mut wb, 0, range("B2", "B2"), MergeAction::Unmerge, false)
        .unwrap();
    assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(4.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(8.0));
}

#[test]
fn unmerge_history_does_not_remove_an_unselected_merge_inside_the_bounding_box() {
    let mut wb = Workbook::new();
    for r in [range("A1", "C1"), range("A5", "C5"), range("B3", "C3")] {
        wb.merge_cells(0, r, MergeAction::Merge, false).unwrap();
    }
    let original = wb.sheet(0).unwrap().merged_ranges().to_vec();
    let mut history = WorkbookHistory::default();
    history
        .merge_cells(&mut wb, 0, range("A1", "A5"), MergeAction::Unmerge, false)
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("B3", "C3")]);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), original);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("B3", "C3")]);
}

#[test]
fn no_op_and_rejected_overlap_do_not_consume_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .merge_cells(&mut wb, 0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    history
        .merge_cells(&mut wb, 0, range("D1", "E2"), MergeAction::Merge, false)
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert!(!history
        .merge_cells(&mut wb, 0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap());
    assert!(history
        .merge_cells(&mut wb, 0, range("B2", "C3"), MergeAction::Merge, true)
        .is_err());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges().len(), 2);
}

#[test]
fn merged_cells_block_spills_and_unmerge_retries_the_native_formula() {
    let mut wb = Workbook::new();
    wb.merge_cells(0, range("B1", "C1"), MergeAction::Merge, false)
        .unwrap();
    wb.set_formula(0, "A1", "=SEQUENCE(1,3)");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Spill));
    wb.merge_cells(0, range("B1", "B1"), MergeAction::Unmerge, false)
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(3.0));
    assert!(wb
        .merge_cells(0, range("A1", "B1"), MergeAction::Merge, true)
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(3.0));
}

#[test]
fn invalid_geometry_foreign_history_and_pending_history_are_rejected() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    assert!(history
        .merge_cells(&mut wb, 0, range("B2", "A1"), MergeAction::Merge, true)
        .is_err());
    history
        .begin(&wb, 0, range("A1", "A1"), "Pending", true)
        .unwrap();
    assert!(history
        .merge_cells(&mut wb, 0, range("A1", "B2"), MergeAction::Merge, true)
        .is_err());
    history.finish(&mut wb, true).unwrap();
    history
        .merge_cells(&mut wb, 0, range("A1", "B2"), MergeAction::Merge, true)
        .unwrap();
    assert!(history.undo(&mut Workbook::new()).is_err());
    assert_eq!(history.undo_count(), 1);
}
