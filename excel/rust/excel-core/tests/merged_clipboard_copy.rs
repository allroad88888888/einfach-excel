use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn merged() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Source".into()));
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    wb
}

#[test]
fn copy_keeps_frozen_merges_and_geometry_only_paste_is_undoable() {
    let mut wb = merged();
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Unmerge, false)
        .unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &snapshot,
        0,
        &ClipboardPasteOptions::new(range("D4", "D4")),
        &mut history,
    )
    .unwrap();
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("D4", "E5")]);
    assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Text("Source".into()));
    assert!(history.undo(&mut wb).unwrap());
    assert!(wb.sheet(0).unwrap().merged_ranges().is_empty());
    assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Null);
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("D4", "E5")]);

    let blank = wb.capture_clipboard(0, range("D4", "E5"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("G1", "G1"));
    options.mode = ClipboardPasteMode::Formats;
    wb.paste_clipboard_with_history(&blank, 0, &options, &mut history)
        .unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("G1", "H2")));
    assert_eq!(wb.get_cell("Sheet1", "G1"), Value::Null);
    assert!(history.undo(&mut wb).unwrap());
    assert!(!wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("G1", "H2")));
}

#[test]
fn a_single_value_pastes_once_into_a_selected_merged_cell_without_unmerging() {
    let mut wb = merged();
    let value = ClipboardSnapshot::from_tsv("42", ClipboardPasteMode::All).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &value,
        0,
        &ClipboardPasteOptions::new(range("A1", "B2")),
        &mut history,
    )
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Source".into()));
}

#[test]
fn tile_and_transpose_copy_the_merged_rectangles_with_shifted_formula_anchors() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "B2", "=A1");
    wb.merge_cells(0, range("B2", "D3"), MergeAction::Merge, false)
        .unwrap();
    let snapshot = wb.capture_clipboard(0, range("B2", "D3"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("F2", "I7"));
    options.transpose = true;
    wb.paste_clipboard(&snapshot, 0, &options).unwrap();
    for merge in [
        range("F2", "G4"),
        range("H2", "I4"),
        range("F5", "G7"),
        range("H5", "I7"),
    ] {
        assert!(wb.sheet(0).unwrap().merged_ranges().contains(&merge));
    }
    assert_eq!(
        wb.sheet(0)
            .unwrap()
            .formula_text_at(CellAddress::parse("F2").unwrap())
            .as_deref(),
        Some("=E1")
    );
    assert_eq!(
        wb.sheet(0)
            .unwrap()
            .formula_text_at(CellAddress::parse("H5").unwrap())
            .as_deref(),
        Some("=G4")
    );
}

#[test]
fn partial_merge_capture_or_overwrite_is_rejected_without_mutation() {
    let mut wb = merged();
    assert!(wb.capture_clipboard(0, range("A1", "A1"), false).is_err());
    let snapshot = ClipboardSnapshot::from_tsv("1\t2", ClipboardPasteMode::All).unwrap();
    assert!(wb
        .paste_clipboard(&snapshot, 0, &ClipboardPasteOptions::new(range("A1", "A1")))
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Source".into()));
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
}
