//! 列宽粘贴只写列属性；历史、默认宽度、预检均走真实工作簿。
use einfach_core::Value;
use einfach_excel_core::clipboard::{
    ClipboardArithmetic, ClipboardPasteMode, ClipboardPasteOptions,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn options(start: &str, end: &str) -> ClipboardPasteOptions {
    ClipboardPasteOptions {
        mode: ClipboardPasteMode::ColumnWidths,
        ..ClipboardPasteOptions::new(range(start, end))
    }
}

#[test]
fn widths_are_frozen_when_copied_and_history_restores_defaults_without_touching_cells() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(0, 200);
    wb.sheet_mut(0).unwrap().set_row_height(0, 80);
    wb.set_cell_input(0, "C1", "12.50%").unwrap();
    wb.set_formula(0, "C2", "=1+2");
    let clip = wb.capture_clipboard(0, range("A1", "A4"), false).unwrap();
    wb.sheet_mut(0).unwrap().set_col_width(0, 300);
    let before_format = wb.sheet(0).unwrap().get_format("C1");
    let evals = wb.debug_formula_eval_count(0);
    let mut history = WorkbookHistory::default();
    let target = wb
        .paste_clipboard_with_history(&clip, 0, &options("C1", "C1"), &mut history)
        .unwrap();
    assert_eq!(target, range("C1", "C1")); // 源区域有四行，但宽度粘贴不需要四行目标。
    assert_eq!(wb.sheet(0).unwrap().col_width(2), Some(200));
    assert_eq!(wb.sheet(0).unwrap().get_format("C1"), before_format);
    assert_eq!(wb.sheet(0).unwrap().row_height(0), Some(80));
    assert_eq!(wb.debug_formula_eval_count(0), evals);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().col_width(2), None);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().col_width(2), Some(200));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(0.125));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C2").as_deref(),
        Some("=1+2")
    );
}

#[test]
fn widths_tile_across_columns_and_default_source_clears_target_override() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(0, 200);
    for col in 2..=5 {
        wb.sheet_mut(0).unwrap().set_col_width(col, 400);
    }
    let clip = wb.capture_clipboard(0, range("A1", "B3"), false).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&clip, 0, &options("C7", "F8"), &mut history)
        .unwrap();
    for col in 2..=5 {
        assert_eq!(
            wb.sheet(0).unwrap().col_width(col),
            if col % 2 == 0 { Some(200) } else { None }
        );
    }
    history.undo(&mut wb).unwrap();
    for col in 2..=5 {
        assert_eq!(wb.sheet(0).unwrap().col_width(col), Some(400));
    }
}

#[test]
fn widths_can_cross_sheets_and_spill_results_without_rewriting_values() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(0, 250);
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let second = wb.add_sheet("Other");
    wb.set_formula(second, "A1", "=SEQUENCE(3)");
    assert!(matches!(wb.get_cell("Other", "A1"), Value::Array(_)));
    wb.paste_clipboard(&clip, second, &options("A2", "A2"))
        .unwrap();
    assert_eq!(wb.sheet(second).unwrap().col_width(0), Some(250));
    assert_eq!(wb.get_cell("Other", "A2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Other", "A3"), Value::Number(3.0));
}

#[test]
fn invalid_width_options_bounds_protection_and_external_clipboard_are_atomic() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(0, 200);
    let clip = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    let cut = wb.capture_clipboard(0, range("A1", "B2"), true).unwrap();
    let mut history = WorkbookHistory::default();
    for (kind, error) in [
        ("transpose", "CLIPBOARD_COLUMN_WIDTH_OPTIONS"),
        ("skip", "CLIPBOARD_COLUMN_WIDTH_OPTIONS"),
        ("arithmetic", "CLIPBOARD_COLUMN_WIDTH_OPTIONS"),
        ("protection", "CLIPBOARD_COLUMN_WIDTH_LOCKED"),
        ("bounds", "CLIPBOARD_OUTSIDE_SHEET"),
        ("shape", "CLIPBOARD_SELECTION_SIZE"),
    ] {
        let mut opts = options("C1", "C1");
        match kind {
            "transpose" => opts.transpose = true,
            "skip" => opts.skip_blanks = true,
            "arithmetic" => opts.arithmetic = ClipboardArithmetic::Add,
            "protection" => opts.unlocked_ranges = Some(vec![range("C1", "D10")]),
            "bounds" => opts.col_count = 3,
            _ => opts.selection = range("C1", "E1"),
        }
        assert_eq!(
            wb.paste_clipboard_with_history(&clip, 0, &opts, &mut history),
            Err(error)
        );
        assert_eq!(wb.sheet(0).unwrap().col_width(2), None);
        assert_eq!(history.undo_count(), 0);
    }
    assert_eq!(
        wb.paste_clipboard(&cut, 0, &options("C1", "C1")),
        Err("CLIPBOARD_CUT_SPECIAL")
    );
    assert!(matches!(
        einfach_excel_core::clipboard::ClipboardSnapshot::from_tsv(
            "200",
            ClipboardPasteMode::ColumnWidths
        ),
        Err("CLIPBOARD_NO_FORMATS")
    ));
}

#[test]
fn unchanged_width_paste_preserves_redo_and_empty_cells_stay_unmaterialized() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(0, 200);
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&clip, 0, &options("B1", "B1"), &mut history)
        .unwrap();
    history.undo(&mut wb).unwrap();
    wb.paste_clipboard_with_history(&clip, 0, &options("A1", "A1"), &mut history)
        .unwrap();
    assert_eq!(history.redo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(wb.sheet(0).unwrap().get_formula("B1"), None);
}
