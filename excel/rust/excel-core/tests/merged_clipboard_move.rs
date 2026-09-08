use einfach_core::Value;
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}

#[test]
fn overlapping_cut_moves_geometry_and_references_in_one_history_entry() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(12.0));
    wb.set_formula(0, "G1", "=A1*2");
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), true).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &snapshot,
        0,
        &ClipboardPasteOptions::new(range("B2", "B2")),
        &mut history,
    )
    .unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("B2", "C3")]);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(12.0));
    assert_eq!(wb.get_cell("Sheet1", "G1"), Value::Number(24.0));
    assert_eq!(
        wb.sheet(0)
            .unwrap()
            .formula_text_at(CellAddress::parse("G1").unwrap())
            .as_deref(),
        Some("=(B2*2)")
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(12.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "G1"), Value::Number(24.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("B2", "C3")]);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(12.0));
}

#[test]
fn a_cut_snapshot_is_invalid_after_source_geometry_changes() {
    let mut wb = Workbook::new();
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), true).unwrap();
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Unmerge, false)
        .unwrap();
    let mut history = WorkbookHistory::default();
    assert!(wb
        .paste_clipboard_with_history(
            &snapshot,
            0,
            &ClipboardPasteOptions::new(range("D1", "D1")),
            &mut history
        )
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
}
