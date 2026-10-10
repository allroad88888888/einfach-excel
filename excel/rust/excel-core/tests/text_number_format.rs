use einfach_core::Value;
use einfach_excel_core::cell_input::editable_cell_text;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellFormat, CellRange, CellStyle, NumberFormat, StyleScope, Workbook,
};

fn a1() -> CellRange {
    CellRange::single(CellAddress::new(0, 0))
}

fn set_text(wb: &mut Workbook, scope: StyleScope) {
    wb.sheet_mut(0).unwrap().patch_format_range(
        a1(),
        scope,
        CellStyle {
            number_format: Some(NumberFormat::Text),
            bold: Some(true),
            ..Default::default()
        },
    );
}

#[test]
fn text_format_preserves_typed_numbers_dates_booleans_and_formulas_as_text() {
    let mut wb = Workbook::new();
    set_text(&mut wb, StyleScope::Cell);
    for input in [
        "00123", "12345678901234567890", "12.5%", "2024-02-29", "12:30",
        "1 1/2", "TRUE", "=1+2", "=SUM(", "  =A2  ", " 00123 ", " ",
    ] {
        wb.set_cell_input(0, "A1", input).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(input.into()), "{input}");
        let format = wb.sheet(0).unwrap().get_format("A1");
        assert_eq!(format.number_format, NumberFormat::Text);
        assert!(format.bold);
        // 重编辑的引号标记仍可复用，不把它存成实际内容。
        let raw = editable_cell_text(&Value::Text(input.into()), "");
        wb.set_cell_input(0, "A1", &raw).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(input.into()));
    }
    wb.set_cell_input(0, "A1", "'00123").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("00123".into()));
    wb.set_cell_input(0, "A1", "").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(wb.sheet(0).unwrap().get_format("A1").number_format, NumberFormat::Text);
}

#[test]
fn applying_text_format_does_not_convert_existing_values_or_remove_formulas() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "=2+3").unwrap();
    set_text(&mut wb, StyleScope::Cell);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(5.0));
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A1"), "5");
    wb.set_cell_input(0, "B1", "=ISNUMBER(A1)").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Boolean(true));
    wb.set_cell_input(0, "A1", "=2+3").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("=2+3".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Boolean(false));
}

#[test]
fn inherited_text_format_obeys_existing_row_column_cell_precedence() {
    for (scope, target) in [(StyleScope::Row, "Z1"), (StyleScope::Column, "A900000")] {
        let mut wb = Workbook::new();
        set_text(&mut wb, scope);
        wb.set_cell_input(0, target, "00123").unwrap();
        assert_eq!(wb.get_cell("Sheet1", target), Value::Text("00123".into()));
        wb.set_cell_input(0, "B2", "00123").unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(123.0));
        wb.sheet_mut(0).unwrap().set_format(target, CellFormat::default());
        // 使用显式 General 覆盖继承的文本格式。
        wb.sheet_mut(0).unwrap().patch_format_range(
            CellRange::single(CellAddress::parse(target).unwrap()), StyleScope::Cell,
            CellStyle { number_format: Some(NumberFormat::General), ..Default::default() },
        );
        wb.set_cell_input(0, target, "00123").unwrap();
        assert_eq!(wb.get_cell("Sheet1", target), Value::Number(123.0));
    }
}

#[test]
fn editing_text_uses_one_existing_history_transaction_and_preserves_format() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell_input(0, "A1", "42").unwrap();
    set_text(&mut wb, StyleScope::Cell);
    history.begin(&wb, 0, a1(), "Edit", true).unwrap();
    wb.set_cell_input(0, "A1", "00123").unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
    assert_eq!(wb.sheet(0).unwrap().get_format("A1").number_format, NumberFormat::Text);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("00123".into()));
    assert_eq!(wb.sheet(0).unwrap().get_format("A1").number_format, NumberFormat::Text);
}
