//! 合并与已有选择性粘贴选项组合，不能借几何变化丢掉目标内容。
use einfach_core::Value;
use einfach_excel_core::clipboard::{
    ClipboardArithmetic, ClipboardPasteMode as Mode, ClipboardPasteOptions, ClipboardSnapshot,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn source() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(5.0));
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    wb
}

#[test]
fn only_full_format_modes_copy_geometry_to_unmerged_destinations() {
    for mode in [
        Mode::All,
        Mode::Values,
        Mode::Formats,
        Mode::ValuesAndFormats,
        Mode::Formulas,
        Mode::FormulasAndNumberFormats,
        Mode::ValuesAndNumberFormats,
    ] {
        let mut wb = source();
        let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
        let mut options = ClipboardPasteOptions::new(range("D4", "D4"));
        options.mode = mode;
        wb.paste_clipboard(&snapshot, 0, &options).unwrap();
        let copied = matches!(mode, Mode::All | Mode::Formats | Mode::ValuesAndFormats);
        assert_eq!(
            wb.sheet(0)
                .unwrap()
                .merged_ranges()
                .contains(&range("D4", "E5")),
            copied,
            "{mode:?}"
        );
    }
}

#[test]
fn formats_only_merge_keeps_target_anchor_value_through_undo_and_redo() {
    let mut wb = source();
    wb.set_formula(0, "D4", "=2+3");
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("D4", "D4"));
    options.mode = Mode::Formats;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
        .unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D4", "E5")));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Number(5.0));
    assert!(wb.sheet(0).unwrap().get_formula("D4").is_some());
    assert!(!wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D4", "E5")));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Number(5.0));
    assert!(wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D4", "E5")));
}

#[test]
fn skipped_empty_merge_does_not_change_geometry_or_create_history() {
    let mut wb = Workbook::new();
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false)
        .unwrap();
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("D1", "D1"));
    options.skip_blanks = true;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
        .unwrap();
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
}

#[test]
fn skip_blanks_geometry_history_restores_only_written_content() {
    let mut wb = source();
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("D1", "D1"));
    options.skip_blanks = true;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
        .unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D1", "E2")));
    history.undo(&mut wb).unwrap();
    assert!(!wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D1", "E2")));
    history.redo(&mut wb).unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("D1", "E2")));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(5.0));
}

#[test]
fn format_only_and_skip_blanks_refuse_to_hide_target_content() {
    for skip in [false, true] {
        let mut wb = source();
        wb.set_cell(0, "E5", Value::Text("Keep".into()));
        let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
        let mut options = ClipboardPasteOptions::new(range("D4", "D4"));
        options.mode = if skip { Mode::All } else { Mode::Formats };
        options.skip_blanks = skip;
        let mut history = WorkbookHistory::default();
        assert!(wb
            .paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
            .is_err());
        assert_eq!(history.undo_count(), 0);
        assert_eq!(wb.get_cell("Sheet1", "E5"), Value::Text("Keep".into()));
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
    }
}

#[test]
fn merged_sources_copy_across_sheets_and_single_values_preserve_target_geometry() {
    let mut wb = source();
    wb.add_sheet("Target");
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    wb.paste_clipboard(&snapshot, 1, &ClipboardPasteOptions::new(range("C3", "C3")))
        .unwrap();
    assert_eq!(wb.sheet(1).unwrap().merged_ranges(), &[range("C3", "D4")]);
    let scalar = ClipboardSnapshot::from_tsv("2", Mode::All).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3", "D4"));
    options.arithmetic = ClipboardArithmetic::Multiply;
    wb.paste_clipboard(&scalar, 1, &options).unwrap();
    assert_eq!(wb.get_cell("Target", "C3"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Target", "D4"), Value::Null);
    assert_eq!(wb.sheet(1).unwrap().merged_ranges(), &[range("C3", "D4")]);
}

#[test]
fn spill_and_protected_destinations_reject_before_changing_merges_or_history() {
    let mut wb = source();
    wb.set_formula(0, "D4", "=SEQUENCE(2,2)");
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("D4", "D4"));
    let mut history = WorkbookHistory::default();
    assert!(wb
        .paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
        .is_err());
    options.selection = range("G1", "G1");
    options.unlocked_ranges = Some(vec![range("G1", "G1")]);
    assert!(wb
        .paste_clipboard_with_history(&snapshot, 0, &options, &mut history)
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
}

#[test]
fn geometry_alone_is_a_history_change_when_values_and_formats_are_identical() {
    use einfach_excel_core::{CellFormat, CellStyle, StyleScope};
    let mut wb = source();
    let destination = range("D1", "E2");
    wb.sheet_mut(0).unwrap().patch_format_range(destination, StyleScope::Cell,
        CellStyle::from_format(CellFormat::default()));
    let snapshot = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("D1", "D1"));
    options.mode = Mode::Formats;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&snapshot, 0, &options, &mut history).unwrap();
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert!(!wb.sheet(0).unwrap().merged_ranges().contains(&destination));
}
