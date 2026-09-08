//! 粘贴加减乘的原生事务验收，不通过宿主计算期望值或写入结果。
use einfach_core::{Value, ValueError};
use einfach_excel_core::clipboard::{
    ClipboardArithmetic, ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn options(start: &str, end: &str, arithmetic: ClipboardArithmetic) -> ClipboardPasteOptions {
    ClipboardPasteOptions {
        arithmetic,
        ..ClipboardPasteOptions::new(range(start, end))
    }
}

#[test]
fn constants_use_target_on_left_and_each_operation_undoes_in_one_step() {
    for (arithmetic, expected, label) in [
        (ClipboardArithmetic::Add, 13.0, "Paste and add"),
        (ClipboardArithmetic::Subtract, 7.0, "Paste and subtract"),
        (ClipboardArithmetic::Multiply, 30.0, "Paste and multiply"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell_input(0, "A1", "3").unwrap();
        wb.set_cell_input(0, "B1", "10").unwrap();
        wb.set_formula(0, "C1", "=B1*2");
        let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
        let mut history = WorkbookHistory::default();
        wb.paste_clipboard_with_history(&clip, 0, &options("B1", "B1", arithmetic), &mut history)
            .unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(expected));
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(expected * 2.0));
        assert_eq!(wb.sheet(0).unwrap().get_formula("B1"), None);
        assert_eq!(history.undo_count(), 1);
        assert_eq!(history.entries().next().unwrap().label, label);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(20.0));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(expected));
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(3.0));
    }
}

#[test]
fn target_formula_is_not_frozen_and_source_relative_references_shift_before_combining() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "2").unwrap();
    wb.set_cell_input(0, "B1", "3").unwrap();
    wb.set_formula(0, "C1", "=$A$1+B1");
    wb.set_formula(0, "D1", "=$A$1*4");
    let clip = wb.capture_clipboard(0, range("C1", "C1"), false).unwrap();
    wb.paste_clipboard(
        &clip,
        0,
        &options("D1", "D1", ClipboardArithmetic::Subtract),
    )
    .unwrap();
    // D1 原来 8，复制公式平移后为 $A$1+C1 = 7，因此结果是 1。
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(1.0));
    let formula = wb.sheet(0).unwrap().get_formula("D1").unwrap();
    assert!(formula.contains("$A$1"));
    assert!(formula.contains("C1"));
    wb.set_cell_input(0, "A1", "4").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(5.0));
}

#[test]
fn values_mode_uses_frozen_source_result_but_preserves_target_formula_and_style() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=1.23456");
    wb.set_cell_input(0, "B1", "4").unwrap();
    wb.set_formula(0, "C1", "=B1+1");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("C1", "C1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    wb.set_formula(0, "A1", "=99");
    let mut opts = options("C1", "C1", ClipboardArithmetic::Multiply);
    opts.mode = ClipboardPasteMode::Values;
    wb.paste_clipboard(&clip, 0, &opts).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(5.0 * 1.23456));
    assert!(wb.sheet(0).unwrap().get_format("C1").bold);
    wb.set_cell_input(0, "B1", "9").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0 * 1.23456));
}

#[test]
fn overlapping_paste_reads_all_original_destinations_before_writing() {
    let mut wb = Workbook::new();
    for (addr, value) in [("A1", "1"), ("B1", "2"), ("C1", "3")] {
        wb.set_cell_input(0, addr, value).unwrap();
    }
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &options("B1", "B1", ClipboardArithmetic::Add))
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(5.0));
}

#[test]
fn transpose_tile_and_skip_blanks_apply_to_arithmetic_and_preserve_skipped_formulas() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "B2", "=99");
    let clip = ClipboardSnapshot::from_tsv("2\t\n3\t4", ClipboardPasteMode::All).unwrap();
    let mut opts = options("A1", "D2", ClipboardArithmetic::Add);
    opts.transpose = true;
    opts.skip_blanks = true;
    wb.paste_clipboard(&clip, 0, &opts).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(103.0));
    assert!(wb.sheet(0).unwrap().get_formula("B2").is_some());
}

#[test]
fn literal_coercion_errors_and_overflow_match_formula_arithmetic() {
    for (source, target, expected) in [
        ("'2", "3", Value::Number(6.0)),
        ("true", "3", Value::Number(3.0)),
        ("false", "3", Value::Number(0.0)),
        ("", "3", Value::Number(0.0)),
        ("2", "", Value::Number(0.0)),
        ("text", "3", Value::Error(ValueError::InvalidValue)),
        ("1e308", "1e308", Value::Error(ValueError::Overflow)),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell_input(0, "A1", source).unwrap();
        wb.set_cell_input(0, "B1", target).unwrap();
        let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
        wb.paste_clipboard(
            &clip,
            0,
            &options("B1", "B1", ClipboardArithmetic::Multiply),
        )
        .unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), expected, "{source} * {target}");
    }
}

#[test]
fn all_mode_copies_source_style_but_not_dimensions_and_history_restores_target() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "2").unwrap();
    wb.set_cell_input(0, "B2", "5").unwrap();
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(range("A1", "A1"), "row", 100)
        .unwrap();
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &clip,
        0,
        &options("B2", "B2", ClipboardArithmetic::Add),
        &mut history,
    )
    .unwrap();
    assert!(wb.sheet(0).unwrap().get_format("B2").bold);
    assert_ne!(wb.sheet(0).unwrap().row_height(1), Some(100));
    history.undo(&mut wb).unwrap();
    assert!(!wb.sheet(0).unwrap().get_format("B2").bold);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(5.0));
}

#[test]
fn invalid_cut_formats_protection_and_spill_reject_without_mutation_or_redo_loss() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "2").unwrap();
    wb.set_cell_input(0, "B1", "5").unwrap();
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let cut = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    let mut history = WorkbookHistory::default();
    let opts = options("B1", "B1", ClipboardArithmetic::Add);
    wb.paste_clipboard_with_history(&clip, 0, &opts, &mut history)
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.paste_clipboard_with_history(&cut, 0, &opts, &mut history),
        Err("CLIPBOARD_CUT_SPECIAL")
    );
    let mut opts = options("B1", "B1", ClipboardArithmetic::Add);
    opts.mode = ClipboardPasteMode::Formats;
    assert_eq!(
        wb.paste_clipboard_with_history(&clip, 0, &opts, &mut history),
        Err("CLIPBOARD_ARITHMETIC_FORMATS")
    );
    opts.mode = ClipboardPasteMode::All;
    opts.unlocked_ranges = Some(vec![range("A1", "A1")]);
    assert_eq!(
        wb.paste_clipboard_with_history(&clip, 0, &opts, &mut history),
        Err("CLIPBOARD_LOCKED")
    );
    assert_eq!(history.redo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(5.0));
    wb.set_formula(0, "C1", "=SEQUENCE(2)");
    wb.get_cell("Sheet1", "C1");
    let external = ClipboardSnapshot::from_tsv("1\t2", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        wb.paste_clipboard(&external, 0, &options("B2", "B2", ClipboardArithmetic::Add)),
        Err("CLIPBOARD_SPILL_TARGET")
    );
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
}

#[test]
fn expanded_formula_budget_rejects_before_any_write_or_history_entry() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=1");
    // 原始文字只有 9 MiB，组合为公式时引号需转义，输出超过 16 MiB。
    let original = "\"".repeat(1024 * 1024);
    for row in 2..=10 {
        wb.set_cell(0, &format!("A{row}"), Value::Text(original.clone()));
    }
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let mut history = WorkbookHistory::default();
    assert_eq!(
        wb.paste_clipboard_with_history(
            &clip,
            0,
            &options("A2", "A10", ClipboardArithmetic::Add),
            &mut history,
        ),
        Err("CLIPBOARD_TOO_LARGE")
    );
    assert_eq!(history.undo_count(), 0);
    for row in 2..=10 {
        assert_eq!(wb.sheet(0).unwrap().get_formula(&format!("A{row}")), None);
        assert_eq!(
            wb.get_cell("Sheet1", &format!("A{row}")),
            Value::Text(original.clone())
        );
    }
}
