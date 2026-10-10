//! 地区数字选项的完整词法校验、类型隔离、一次写入及历史。
use einfach_core::Value;
use einfach_excel_core::text_columns::TextColumnsMode;
use einfach_excel_core::text_columns_number::TextColumnsNumberOptions as Options;
use einfach_excel_core::text_columns_value::{TextColumnDateOrder, TextColumnRule, TextColumnType as Kind};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
use einfach_excel_core::{CellAddress, CellRange, NumberFormat, Workbook};

fn request(options: Options) -> TextColumnsRequest {
    TextColumnsRequest {
        sheet: 0, source: CellRange::single(CellAddress::new(0, 0)),
        destination: CellAddress::new(0, 2), row_count: 1000, col_count: 8,
        mode: TextColumnsMode::Delimited { delimiters: vec![';'], merge_consecutive: false, qualifier: Some('"') },
        column_types: vec![TextColumnRule { column: 0, kind: Kind::General }],
        number_options: Some(options),
    }
}

fn converted(text: &str, options: Options) -> Value {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text(text.into()));
    WorkbookHistory::default().split_text_columns(&mut wb, &request(options), false).unwrap();
    wb.get_cell("Sheet1", "C1")
}

#[test]
fn decimal_choice_is_explicit_and_never_falls_back_to_the_other_separator() {
    for (decimal, valid, invalid) in [('.', "12.50", "12,50"), (',', "12,50", "12.50")] {
        let options = Options { decimal_separator: decimal, ..Default::default() };
        assert_eq!(converted(valid, options), Value::Number(12.5));
        assert_eq!(converted(invalid, options), Value::Text(invalid.into()));
    }
    let comma = Options { decimal_separator: ',', ..Default::default() };
    assert_eq!(converted(",5", comma), Value::Number(0.5));
    assert_eq!(converted("5,", comma), Value::Number(5.0));
    assert_eq!(converted("+1,25e2", comma), Value::Number(125.0));
    assert_eq!(converted("1,25e-2", comma), Value::Number(0.0125));
}

#[test]
fn supported_group_separators_require_complete_three_digit_groups() {
    for separator in [',', '.', ' ', '\u{a0}', '\u{202f}', '\''] {
        let decimal = if separator == '.' { ',' } else { '.' };
        let source = format!("1{separator}234{separator}567{decimal}89");
        let options = Options { decimal_separator: decimal, group_separator: Some(separator), trailing_minus: false };
        assert_eq!(converted(&source, options), Value::Number(1_234_567.89));
        assert_eq!(converted(&format!("12{separator}34"), options), Value::Text(format!("12{separator}34")));
    }
    assert_eq!(converted("1,234", Options::default()), Value::Text("1,234".into()));
}

#[test]
fn malformed_grouping_and_exponents_preserve_the_original_field() {
    let options = Options { group_separator: Some(','), ..Default::default() };
    for source in ["12,34", "1234,567", ",123", "123,", "1,,234", "1,234.5,6",
        "1,234e1,000", "1,234e", "1,234e+", "1e2e3", "1_234", "1 234", "12.3.4", ".", "--1"] {
        assert_eq!(converted(source, options), Value::Text(source.into()), "{source}");
    }
    let comma = Options { decimal_separator: ',', group_separator: Some('.'), trailing_minus: false };
    // 原生默认语法可把它读作 123.45，但在当前地区设置下它是错误的分组。
    assert_eq!(converted("123.45", comma), Value::Text("123.45".into()));
}

#[test]
fn trailing_minus_is_opt_in_and_combines_with_grouping_percentage_and_exponents() {
    let options = Options { decimal_separator: ',', group_separator: Some('.'), trailing_minus: true };
    for (source, expected) in [("1.234,5-", -1234.5), ("1,25e2-", -125.0), ("12,5%-", -0.125),
        (" 123- ", -123.0), ("-12,5", -12.5)] {
        assert_eq!(converted(source, options), Value::Number(expected));
    }
    for source in ["-123-", "+123-", "123--", "123-4", "1,25-abc"] {
        assert_eq!(converted(source, options), Value::Text(source.into()));
    }
    assert_eq!(converted("1.234,5-", Options { trailing_minus: false, ..options }),
        Value::Text("1.234,5-".into()));
}

#[test]
fn nonfinite_results_keep_original_spelling_and_never_become_formulas() {
    let options = Options { decimal_separator: ',', group_separator: Some('.'), trailing_minus: true };
    for source in ["1,25e999", "NaN", "Infinity", "=1+2", "'001", "=SUM(A1)"] {
        assert_eq!(converted(source, options), Value::Text(source.into()));
    }
}

#[test]
fn general_booleans_unambiguous_dates_time_and_fractions_keep_the_existing_native_parser() {
    let options = Options { decimal_separator: ',', ..Default::default() };
    for (source, expected) in [("TRUE", Value::Boolean(true)), ("2024-02-29", Value::Number(45351.0)),
        ("12:00", Value::Number(0.5)), ("1 1/2", Value::Number(1.5))] {
        assert_eq!(converted(source, options), expected);
    }
}

#[test]
fn text_explicit_date_and_unspecified_fields_ignore_general_number_options() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("1,25;1,25;29/02/2024;1,25".into()));
    let mut req = request(Options { decimal_separator: ',', ..Default::default() });
    req.column_types.extend([TextColumnRule { column: 1, kind: Kind::Text },
        TextColumnRule { column: 2, kind: Kind::Date(TextColumnDateOrder::Dmy) }]);
    WorkbookHistory::default().split_text_columns(&mut wb, &req, false).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(1.25));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Text("1,25".into()));
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(45351.0));
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Text("1,25".into()));
}

#[test]
fn invalid_separator_options_reject_before_preview_or_any_history_mutation() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("123".into()));
    for options in [Options { group_separator: Some('.'), ..Default::default() },
        Options { decimal_separator: 'x', ..Default::default() },
        Options { group_separator: Some('e'), ..Default::default() }] {
        assert!(wb.preview_text_columns(&request(options)).is_err());
        assert!(history.split_text_columns(&mut wb, &request(options), true).is_err());
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn percentage_precision_preview_and_undo_redo_share_one_native_result() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("12,50%-".into()));
    wb.set_formula(0, "C1", "=42");
    let before = wb.sheet(0).unwrap().get_format("C1");
    let req = request(Options { decimal_separator: ',', trailing_minus: true, ..Default::default() });
    let preview = wb.preview_text_columns(&req).unwrap();
    assert_eq!(preview.sample[0][0], "-12.50%");
    assert_eq!(preview.overwritten_cells, 1);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(42.0));
    history.split_text_columns(&mut wb, &req, true).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(-0.125));
    assert_eq!(wb.sheet(0).unwrap().get_format("C1").number_format, NumberFormat::Percent { digits: 2 });
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_formula("C1").as_deref(), Some("=42"));
    assert_eq!(wb.sheet(0).unwrap().get_format("C1"), before);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("C1"), "-12.50%");
}
