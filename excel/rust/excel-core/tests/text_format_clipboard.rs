//! 文本格式按目标格解析外部 TSV；内部快照不重新解释类型。
use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteMode as Mode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}

fn text_format(wb: &mut Workbook, first: &str, last: &str, scope: StyleScope) {
    wb.sheet_mut(0).unwrap().patch_format_range(range(first, last), scope, CellStyle {
        number_format: Some(NumberFormat::Text), bold: Some(true), ..Default::default()
    });
}

#[test]
fn external_paste_preserves_text_syntax_and_exact_digits_in_every_input_mode() {
    for mode in [Mode::All, Mode::Values, Mode::Formulas] {
        let mut wb = Workbook::new();
        text_format(&mut wb, "A1", "L1", StyleScope::Row);
        let fields = ["00123", "12345678901234567890", "12.5%", "2024-02-29", "12:30",
            "1 1/2", "TRUE", "=1+2", "=SUM(", " 00123 ", "'00123", ""];
        let clip = ClipboardSnapshot::from_tsv(&fields.join("\t"), mode).unwrap();
        let mut options = ClipboardPasteOptions::new(range("A1", "A1"));
        options.mode = mode;
        wb.paste_clipboard(&clip, 0, &options).unwrap();
        for (col, field) in fields.iter().enumerate() {
            let addr = CellAddress::new(0, col as u32).to_string_repr();
            let expected = if field.is_empty() { Value::Null }
                else { Value::Text(field.strip_prefix('\'').unwrap_or(field).into()) };
            assert_eq!(wb.get_cell("Sheet1", &addr), expected, "{mode:?}: {addr}");
            assert_eq!(wb.sheet(0).unwrap().get_formula(&addr), None);
            assert!(wb.sheet(0).unwrap().get_format(&addr).bold);
        }
    }
}

#[test]
fn transposed_tiling_uses_each_destination_format_and_one_history_entry() {
    let mut wb = Workbook::new();
    text_format(&mut wb, "C1", "C1", StyleScope::Column);
    text_format(&mut wb, "E1", "E1", StyleScope::Column);
    let clip = ClipboardSnapshot::from_tsv("00123\t=2+3", Mode::All).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3", "F4"));
    options.transpose = true;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    for col in ["C", "E"] {
        assert_eq!(wb.get_cell("Sheet1", &format!("{col}3")), Value::Text("00123".into()));
        assert_eq!(wb.get_cell("Sheet1", &format!("{col}4")), Value::Text("=2+3".into()));
    }
    for col in ["D", "F"] {
        assert_eq!(wb.get_cell("Sheet1", &format!("{col}3")), Value::Number(123.0));
        assert_eq!(wb.get_cell("Sheet1", &format!("{col}4")), Value::Number(5.0));
    }
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    for addr in range("C3", "F4").iter() {
        assert_eq!(wb.get_cell("Sheet1", &addr.to_string_repr()), Value::Null);
    }
    assert_eq!(wb.sheet(0).unwrap().get_format("C3").number_format, NumberFormat::Text);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Text("00123".into()));
    assert_eq!(wb.get_cell("Sheet1", "F4"), Value::Number(5.0));
}

#[test]
fn invalid_formula_only_rejects_non_text_targets_before_any_write() {
    let mut wb = Workbook::new();
    text_format(&mut wb, "A1", "A1", StyleScope::Cell);
    wb.set_cell_input(0, "A1", "before").unwrap();
    wb.set_cell_input(0, "B1", "7").unwrap();
    let clip = ClipboardSnapshot::from_tsv("=SUM(", Mode::All).unwrap();
    let mut history = WorkbookHistory::default();
    assert_eq!(wb.paste_clipboard_with_history(&clip, 0,
        &ClipboardPasteOptions::new(range("A1", "B1")), &mut history),
        Err("CLIPBOARD_INVALID_FORMULA"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("before".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(7.0));
    assert_eq!(history.undo_count(), 0);
    wb.paste_clipboard_with_history(&clip, 0,
        &ClipboardPasteOptions::new(range("A1", "A1")), &mut history).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("=SUM(".into()));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn internal_values_and_formulas_keep_their_types_on_text_formatted_targets() {
    for mode in [Mode::Values, Mode::Formulas] {
        let mut wb = Workbook::new();
        wb.set_cell_input(0, "A1", "123").unwrap();
        wb.set_cell_input(0, "B1", "=2+3").unwrap();
        text_format(&mut wb, "C3", "D3", StyleScope::Cell);
        let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
        let mut options = ClipboardPasteOptions::new(range("C3", "C3"));
        options.mode = mode;
        wb.paste_clipboard(&clip, 0, &options).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(123.0));
        assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(5.0));
        assert_eq!(wb.sheet(0).unwrap().get_formula("D3").is_some(), mode == Mode::Formulas);
        assert_eq!(wb.sheet(0).unwrap().get_format("D3").number_format, NumberFormat::Text);
    }
}

#[test]
fn external_blank_skip_and_apostrophe_keep_existing_blank_semantics() {
    let mut wb = Workbook::new();
    text_format(&mut wb, "A1", "D1", StyleScope::Row);
    for addr in ["A1", "B1", "C1", "D1"] { wb.set_cell_input(0, addr, "keep").unwrap(); }
    let clip = ClipboardSnapshot::from_tsv("\t'\t\"two\nlines\"\t\"a\"\"b\"", Mode::All).unwrap();
    let mut options = ClipboardPasteOptions::new(range("A1", "A1"));
    options.skip_blanks = true;
    wb.paste_clipboard(&clip, 0, &options).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("keep".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("".into()));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("two\nlines".into()));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Text("a\"b".into()));
    options.skip_blanks = false;
    wb.paste_clipboard(&clip, 0, &options).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
}
