use einfach_core::{Value, ValueError};
use einfach_excel_core::clipboard::{
    ClipboardArithmetic, ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn single(addr: &str) -> CellRange {
    CellRange::single(CellAddress::parse(addr).unwrap())
}

#[test]
fn division_uses_target_over_source_and_zero_errors_are_undoable() {
    for (source, expected) in [
        ("3", Value::Number(4.0)),
        ("0", Value::Error(ValueError::DivisionByZero)),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell_input(0, "A1", "12").unwrap();
        let clip = ClipboardSnapshot::from_tsv(source, ClipboardPasteMode::All).unwrap();
        let opts = ClipboardPasteOptions {
            arithmetic: ClipboardArithmetic::Divide,
            ..ClipboardPasteOptions::new(single("A1"))
        };
        let mut history = WorkbookHistory::default();
        wb.paste_clipboard_with_history(&clip, 0, &opts, &mut history)
            .unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), expected);
        assert_eq!(history.entries().next().unwrap().label, "Paste and divide");
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(12.0));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), expected);
    }
}

#[test]
fn combined_values_divide_transpose_skip_blanks_keeps_the_target_formula_live() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "2").unwrap();
    wb.set_formula(0, "A2", "=9");
    wb.set_formula(0, "C1", "=$A$2*2");
    wb.set_formula(0, "C2", "=7");
    let clip = wb
        .capture_clipboard(
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 1)),
            false,
        )
        .unwrap();
    let opts = ClipboardPasteOptions {
        mode: ClipboardPasteMode::Values,
        arithmetic: ClipboardArithmetic::Divide,
        transpose: true,
        skip_blanks: true,
        ..ClipboardPasteOptions::new(single("C1"))
    };
    wb.paste_clipboard(&clip, 0, &opts).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(9.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C2").as_deref(),
        Some("=7")
    );
    wb.set_cell_input(0, "A2", "12").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(12.0));
}
