use super::*;
use crate::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};

#[test]
fn literal_text_round_trips_without_losing_leading_zeros_quotes_or_formulas() {
    for text in [
        "00123", "=1+2", "=SUM(", "TRUE", "false", "12.5%", "'hello", "", "  ", "normal",
        "one\ntwo",
    ] {
        let value = Value::Text(text.into());
        assert_eq!(
            parse_cell_input(&editable_cell_text(&value, ""), true),
            CellInput::Literal(value)
        );
    }
    assert_eq!(
        parse_cell_input("'00123", true),
        CellInput::Literal(Value::Text("00123".into()))
    );
    assert_eq!(
        parse_cell_input("''hello", true),
        CellInput::Literal(Value::Text("'hello".into()))
    );
}

#[test]
fn booleans_are_typed_and_percentages_keep_the_input_precision() {
    assert_eq!(
        parse_cell_input(" FaLsE ", true),
        CellInput::Literal(Value::Boolean(false))
    );
    assert_eq!(
        parse_cell_input("TRUE", true),
        CellInput::Literal(Value::Boolean(true))
    );
    assert_eq!(
        parse_cell_input("12.50%", true),
        CellInput::Percentage {
            value: 0.125,
            digits: 2
        }
    );
    assert_eq!(
        parse_cell_input("-2.5%", true),
        CellInput::Percentage {
            value: -0.025,
            digits: 1
        }
    );
    assert_eq!(
        parse_cell_input("1e-3%", true),
        CellInput::Percentage {
            value: 0.00001,
            digits: 3
        }
    );
    assert!(matches!(
        parse_cell_input("1e-9223372036854775808%", true),
        CellInput::Percentage { .. }
    ));
}

#[test]
fn unsupported_inputs_remain_text_and_values_only_does_not_execute_formulas() {
    for text in ["NaN", "inf", "1e999", "12%%", "%", "2026-09-08", "0x10"] {
        assert_eq!(
            parse_cell_input(text, true),
            CellInput::Literal(Value::Text(text.into()))
        );
    }
    assert_eq!(parse_cell_input("", true), CellInput::Literal(Value::Null));
    assert_eq!(
        parse_cell_input("=SUM(", false),
        CellInput::Literal(Value::Text("=SUM(".into()))
    );
}

#[test]
fn workbook_input_installs_real_types_and_dependent_formulas_recalculate() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "'00123").unwrap();
    wb.set_cell_input(0, "B1", "false").unwrap();
    wb.set_cell_input(0, "C1", "12.5%").unwrap();
    wb.set_cell_input(0, "D1", "=IF(B1,C1*100,0)").unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_cell("A1"),
        Value::Text("00123".into())
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("B1"), Value::Boolean(false));
    assert_eq!(wb.sheet(0).unwrap().get_cell("C1"), Value::Number(0.125));
    assert_eq!(wb.sheet(0).unwrap().get_cell("D1"), Value::Number(0.0));
    wb.set_cell_input(0, "B1", "TRUE").unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("D1"), Value::Number(12.5));
}

#[test]
fn percentage_format_changes_only_the_target_number_format() {
    let mut wb = Workbook::new();
    let range = CellRange::single(CellAddress::new(0, 0));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range,
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.set_cell_input(0, "A1", "12.50%").unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.formatted_display("A1"), "12.50%");
    assert!(sheet.get_format("A1").bold);
    assert_eq!(sheet.get_format("B1").number_format, NumberFormat::General);
    wb.set_cell_input(0, "A1", "0.125").unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A1"), "12.50%");
}

#[test]
fn invalid_formulas_and_cycles_are_rejected_before_replacing_existing_data() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "7").unwrap();
    wb.set_cell_input(0, "B1", "=A1*2").unwrap();
    for (input, error) in [("=SUM(", "INVALID_FORMULA"), ("=B1", "FORMULA_CYCLE")] {
        assert_eq!(wb.set_cell_input(0, "A1", input), Err(error));
        assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(7.0));
        assert_eq!(wb.sheet(0).unwrap().get_cell("B1"), Value::Number(14.0));
    }
}

#[test]
fn text_marker_is_not_stored_and_whitespace_is_not_silently_cleared() {
    let mut wb = Workbook::new();
    for (input, expected) in [("'=1+2", "=1+2"), ("'", ""), ("  ", "  ")] {
        wb.set_cell_input(0, "A1", input).unwrap();
        assert_eq!(
            wb.sheet(0).unwrap().get_cell("A1"),
            Value::Text(expected.into())
        );
        assert_eq!(wb.sheet(0).unwrap().get_formula("A1"), None);
    }
    wb.set_cell_input(0, "A1", "").unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Null);
}

#[test]
fn clipboard_uses_the_same_literal_boolean_and_percentage_parser_without_changing_style() {
    use crate::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
    let mut wb = Workbook::new();
    let clip =
        ClipboardSnapshot::from_tsv("'00123\tfalse\t12.5%", ClipboardPasteMode::All).unwrap();
    wb.paste_clipboard(
        &clip,
        0,
        &ClipboardPasteOptions::new(CellRange::single(CellAddress::new(0, 0))),
    )
    .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("A1"), Value::Text("00123".into()));
    assert_eq!(sheet.get_cell("B1"), Value::Boolean(false));
    assert_eq!(sheet.get_cell("C1"), Value::Number(0.125));
    assert_eq!(sheet.get_format("C1").number_format, NumberFormat::General);
}
