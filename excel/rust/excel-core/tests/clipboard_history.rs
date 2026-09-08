use einfach_core::Value;
use einfach_excel_core::clipboard::{
    ClipboardPasteMode as Mode, ClipboardPasteOptions, ClipboardSnapshot,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}

#[test]
fn every_paste_mode_restores_target_raw_input_format_and_geometry() {
    for mode in [
        Mode::All,
        Mode::Values,
        Mode::Formats,
        Mode::Formulas,
        Mode::ValuesAndFormats,
        Mode::FormulasAndNumberFormats,
        Mode::ValuesAndNumberFormats,
    ] {
        let mut wb = Workbook::new();
        wb.set_formula(0, "A1", "=2+3");
        wb.sheet_mut(0).unwrap().patch_format_range(
            range("A1", "A1"),
            StyleScope::Cell,
            CellStyle {
                bold: Some(true),
                font_size: Some(Some(36)),
                ..Default::default()
            },
        );
        wb.set_cell_input(0, "C4", "'00123").unwrap();
        let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
        let mut options = ClipboardPasteOptions::new(range("C4", "C4"));
        options.mode = mode;
        let mut history = WorkbookHistory::default();
        wb.paste_clipboard_with_history(&clip, 0, &options, &mut history)
            .unwrap();
        let after_value = wb.get_cell("Sheet1", "C4");
        let after_formula = wb.sheet(0).unwrap().get_formula("C4");
        let after_style = wb.sheet(0).unwrap().effective_format("C4");
        let after_height = wb.sheet(0).unwrap().row_height(3);
        assert_eq!(history.undo_count(), 1, "{mode:?}");
        history.undo(&mut wb).unwrap();
        assert_eq!(
            wb.get_cell("Sheet1", "C4"),
            Value::Text("00123".into()),
            "{mode:?}"
        );
        assert_eq!(wb.sheet(0).unwrap().row_height(3), None);
        assert!(!wb.sheet(0).unwrap().effective_format("C4").bold);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C4"), after_value);
        assert_eq!(wb.sheet(0).unwrap().get_formula("C4"), after_formula);
        assert_eq!(wb.sheet(0).unwrap().effective_format("C4"), after_style);
        assert_eq!(wb.sheet(0).unwrap().row_height(3), after_height);
    }
}

#[test]
fn transposed_tiling_is_one_step_and_restores_empty_and_nonempty_targets() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("1\t2\n3\t4", Mode::All).unwrap();
    wb.set_cell_input(0, "C3", "before").unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3", "F6"));
    options.transpose = true;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "F6"), Value::Number(4.0));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Text("before".into()));
    assert_eq!(wb.get_cell("Sheet1", "F6"), Value::Null);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "F6"), Value::Number(4.0));
}

#[test]
fn skip_blanks_history_does_not_clear_skipped_spill_cells() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=SEQUENCE(2)");
    wb.get_cell("Sheet1", "A1");
    let clip = ClipboardSnapshot::from_tsv("\t7", Mode::All).unwrap();
    let mut options = ClipboardPasteOptions::new(range("A2", "A2"));
    options.skip_blanks = true;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(7.0));
}

#[test]
fn cut_undo_restores_overlapping_cells_and_same_sheet_and_cross_sheet_references() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    wb.set_cell(0, "A2", Value::Number(8.0));
    wb.set_cell(0, "A3", Value::Number(9.0));
    wb.set_formula(0, "D1", "=A1+A2");
    let summary = wb.add_sheet("Summary");
    wb.set_formula(summary, "A1", "=Sheet1!A1+Sheet1!A2");
    let clip = wb.capture_clipboard(0, range("A1", "A2"), true).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &clip,
        0,
        &ClipboardPasteOptions::new(range("A2", "A2")),
        &mut history,
    )
    .unwrap();
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(8.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("D1").as_deref(),
        Some("=(A2+A3)")
    );
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(15.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(8.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(9.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("D1").as_deref(),
        Some("=A1+A2")
    );
    assert_eq!(
        wb.sheet(summary).unwrap().get_formula("A1").as_deref(),
        Some("=Sheet1!A1+Sheet1!A2")
    );
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(15.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(8.0));
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(15.0));
}

#[test]
fn invalid_paste_and_empty_skip_do_not_consume_redo_or_change_the_workbook() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let clip = ClipboardSnapshot::from_tsv("7\t8", Mode::All).unwrap();
    wb.paste_clipboard_with_history(
        &clip,
        0,
        &ClipboardPasteOptions::new(range("A1", "A1")),
        &mut history,
    )
    .unwrap();
    history.undo(&mut wb).unwrap();
    let bad = ClipboardPasteOptions::new(range("A2", "C2"));
    assert!(wb
        .paste_clipboard_with_history(&clip, 0, &bad, &mut history)
        .is_err());
    assert_eq!(history.redo_count(), 1);
    let empty = wb.capture_clipboard(0, range("A4", "A4"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("A2", "A2"));
    options.skip_blanks = true;
    wb.paste_clipboard_with_history(&empty, 0, &options, &mut history)
        .unwrap();
    assert_eq!(history.redo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
}

#[test]
fn format_only_history_never_evaluates_or_rewrites_the_destination_formula() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    wb.set_formula(0, "B1", "=1+2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let mut history = WorkbookHistory::default();
    let mut options = ClipboardPasteOptions::new(range("B1", "B1"));
    options.mode = Mode::Formats;
    let before = wb.debug_formula_eval_count(0);
    wb.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        .unwrap();
    history.undo(&mut wb).unwrap();
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.debug_formula_eval_count(0), before);
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B1").as_deref(),
        Some("=1+2")
    );
}

#[test]
fn disjoint_cut_history_does_not_restore_the_gap_between_source_and_target() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &clip,
        0,
        &ClipboardPasteOptions::new(range("A1000", "A1000")),
        &mut history,
    )
    .unwrap();
    // 直接改一个不属于该移动的格子，检查快照没有把两个区域之间的间隙包进去。
    wb.set_cell(0, "A500", Value::Number(99.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "A1000"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "A500"), Value::Number(99.0));
}
