//! 独立常量核对日期基准，不能只让两个使用同一错误算法的公式互相验证。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

fn evaluate(formula: &str) -> Value {
    let mut workbook = Workbook::new();
    assert!(workbook.set_formula(0, "A1", formula));
    workbook.get_cell("Sheet1", "A1")
}

#[test]
fn date_uses_excel_1900_serials_including_the_compatibility_leap_day() {
    for (formula, serial) in [
        ("=DATE(1900,1,1)", 1.0),
        ("=DATE(1900,2,28)", 59.0),
        ("=DATE(1900,2,29)", 60.0),
        ("=DATE(1900,3,1)", 61.0),
        ("=DATE(1970,1,1)", 25569.0),
        ("=DATE(2024,1,1)", 45292.0),
        ("=DATE(2024,2,29)", 45351.0),
        ("=DATE(9999,12,31)", 2958465.0),
    ] {
        assert_eq!(evaluate(formula), Value::Number(serial), "{formula}");
    }
}

#[test]
fn date_normalizes_short_years_month_overflow_and_day_offsets() {
    for (formula, serial) in [
        ("=DATE(0,1,1)", 1.0),
        ("=DATE(70,1,1)", 25569.0),
        ("=DATE(2023,13,1)", 45292.0),
        ("=DATE(2024,0,32)", 45292.0),
        ("=DATE(2024,3,0)", 45351.0),
        ("=DATE(2024,1,60)", 45351.0),
        ("=DATE(1900,1,0)", 0.0),
        ("=DATE(2024.9,1.9,1.9)", 45292.0),
    ] {
        assert_eq!(evaluate(formula), Value::Number(serial), "{formula}");
    }
    for formula in [
        "=DATE(-1,1,1)",
        "=DATE(10000,1,1)",
        "=DATE(2024,1e99,1)",
        "=DATE(2024,1,1e99)",
        "=DATE(9999,12,32)",
    ] {
        assert_eq!(
            evaluate(formula),
            Value::Error(ValueError::Overflow),
            "{formula}"
        );
    }
}

#[test]
fn date_parts_keep_zero_and_phantom_day_without_timezone_conversion() {
    for (formula, value) in [
        ("=YEAR(0)", 1900.0),
        ("=MONTH(0)", 1.0),
        ("=DAY(0)", 0.0),
        ("=YEAR(60.75)", 1900.0),
        ("=MONTH(60.75)", 2.0),
        ("=DAY(60.75)", 29.0),
        ("=YEAR(25569)", 1970.0),
        ("=DAY(45351)", 29.0),
    ] {
        assert_eq!(evaluate(formula), Value::Number(value), "{formula}");
    }
    for formula in ["=YEAR(-1)", "=MONTH(1e99)", "=DAY(2958466)"] {
        assert_eq!(
            evaluate(formula),
            Value::Error(ValueError::Overflow),
            "{formula}"
        );
    }
    assert_eq!(
        evaluate("=YEAR(1/0)"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        evaluate("=DATE(2024,1/0,1)"),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn month_and_week_functions_reject_unrepresentable_serials_and_offsets() {
    for formula in [
        "=WEEKDAY(-1)",
        "=WEEKDAY(1e99)",
        "=WEEKNUM(1e99)",
        "=EDATE(1e99,1)",
        "=EDATE(45292,1e99)",
        "=EOMONTH(-1,0)",
        "=EOMONTH(2958465,1)",
        "=EDATE(1,-1)",
    ] {
        assert_eq!(
            evaluate(formula),
            Value::Error(ValueError::Overflow),
            "{formula}"
        );
    }
}

#[test]
fn datevalue_uses_same_serial_and_rejects_ambiguous_or_invalid_dates() {
    for (text, serial) in [
        ("1900-02-29", 60.0),
        ("2024/2/29", 45351.0),
        ("1970-01-01", 25569.0),
        (" 2024-01-01 ", 45292.0),
    ] {
        assert_eq!(
            evaluate(&format!("=DATEVALUE(\"{text}\")")),
            Value::Number(serial)
        );
    }
    for text in [
        "2023-02-29",
        "02/03/2024",
        "24-01-01",
        "1900-01-00",
        "1899-12-31",
        "2024-13-01",
        "2024-01/01",
        "2024-01-01x",
    ] {
        assert_eq!(
            evaluate(&format!("=DATEVALUE(\"{text}\")")),
            Value::Error(ValueError::InvalidValue),
            "{text}"
        );
    }
}

#[test]
fn weekday_weeknum_and_workday_share_the_serial_origin() {
    for (formula, value) in [
        ("=WEEKDAY(1)", 1.0),
        ("=WEEKDAY(59)", 3.0),
        ("=WEEKDAY(60)", 4.0),
        ("=WEEKDAY(61)", 5.0),
        ("=WEEKDAY(25569)", 5.0),
        ("=WEEKDAY(45292,2)", 1.0),
        ("=WEEKNUM(45292,2)", 1.0),
        ("=ISOWEEKNUM(44197)", 53.0),
        ("=WORKDAY(45292,5)", 45299.0),
        ("=NETWORKDAYS(45292,45303)", 10.0),
        ("=EOMONTH(45292,1)", 45351.0),
        ("=EOMONTH(32,0)", 60.0),
        ("=EDATE(31,1)", 60.0),
    ] {
        assert_eq!(evaluate(formula), Value::Number(value), "{formula}");
    }
}

#[test]
fn native_fill_and_formulas_agree_across_the_phantom_leap_day() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(59.0));
    wb.set_formula(0, "B2", "=DAY(A2)");
    wb.set_formula(0, "B3", "=MONTH(A3)");
    wb.apply_auto_fill(&AutoFillRequest {
        sheet_idx: 0,
        source_range: CellRange::single(CellAddress::new(0, 0)),
        target_range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
        direction: AutoFillDirection::Down,
        series: AutoFillSeries::DateDay,
        step: Some(1.0),
        text_pattern: None,
        list: None,
    })
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(60.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(61.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(29.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(3.0));
}
