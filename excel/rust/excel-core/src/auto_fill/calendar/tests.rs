use super::*;
use crate::date_serial::{valid_date_serial, weekday_sunday_indexed, MAX_DATE_SERIAL};
use crate::workbook_history::WorkbookHistory;

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn range(first: &str, last: &str) -> CellRange { CellRange::new(addr(first), addr(last)) }
fn serial(year: i32, month: u32, day: u32) -> f64 {
    excel_date_parts_to_serial(ExcelDateParts { year, month, day, fraction: 0.0 }).unwrap()
}
fn request(series: AutoFillSeries, step: f64, count: u32) -> AutoFillRequest {
    AutoFillRequest {
        named_lists: crate::AutoFillNamedLists::empty(),
        sheet_idx: 0, source_range: range("A1", "A1"),
        target_range: CellRange::new(addr("A1"), CellAddress::new(count, 0)),
        direction: AutoFillDirection::Down, series, step: Some(step), text_pattern: None, list: None,
    }
}
fn assert_series(start: f64, series: AutoFillSeries, step: f64, expected: &[f64]) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(start));
    book.set_cell(0, "B2", Value::Number(901.0));
    let format = CellFormat { italic: true,
        number_format: crate::NumberFormat::Custom("yyyy-mm-dd hh:mm".into()),
        ..CellFormat::default() };
    book.sheet_mut(0).unwrap().set_format("A1", format.clone());
    assert!(format.format_number(expected[0]).contains(':'));
    let req = request(series, step, expected.len() as u32);
    let mut history = WorkbookHistory::default();
    history.begin(&book, 0, range("A2", &format!("A{}", expected.len() + 1)), "Calendar", true).unwrap();
    assert_eq!(history.apply_auto_fill(&mut book, &req).unwrap().written, expected.len());
    history.finish(&mut book, true).unwrap();
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("A1")), Value::Number(start));
    for (offset, expected) in expected.iter().enumerate() {
        let at = format!("A{}", offset + 2);
        assert_eq!(book.sheet(0).unwrap().peek_value(addr(&at)), Value::Number(*expected));
        assert_eq!(book.sheet(0).unwrap().effective_format(&at), format);
    }
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Null);
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("B2")), Value::Number(901.0));
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(expected[0]));
}

#[test]
fn workdays_skip_weekends_in_both_directions_and_preserve_time() {
    let fri = serial(2024, 3, 1);
    assert_series(fri + 0.5, AutoFillSeries::DateWeekday, 1.0,
        &[fri + 3.5, fri + 4.5, fri + 5.5]);
    assert_series(fri, AutoFillSeries::DateWeekday, 2.0, &[fri + 4.0, fri + 6.0]);
    assert_series(fri + 3.0, AutoFillSeries::DateWeekday, -1.0, &[fri, fri - 1.0]);
    for weekend in [fri + 1.0, fri + 2.0] {
        assert_series(weekend, AutoFillSeries::DateWeekday, 1.0, &[fri + 3.0, fri + 4.0]);
        assert_series(weekend, AutoFillSeries::DateWeekday, -2.0, &[fri - 1.0, fri - 3.0]);
    }
}

#[test]
fn workday_arithmetic_matches_bounded_day_walk_including_excel_1900_compatibility() {
    for anchor in [0, 1, 2, 58, 59, 60, 61, 45351, 45352, 45353, 45354] {
        for offset in [-12_i64, -5, -2, -1, 1, 2, 5, 12] {
            let mut expected = anchor;
            let mut remaining = offset.abs();
            while remaining > 0 {
                expected += offset.signum();
                if (1..=5).contains(&weekday_sunday_indexed(expected)) { remaining -= 1; }
            }
            assert_eq!(weekday::add_workdays(anchor as f64 + 0.25, offset),
                Some(expected as f64 + 0.25));
        }
    }
    assert_series(0.25, AutoFillSeries::DateWeekday, 1.0, &[2.25, 3.25]);
    assert_series(60.25, AutoFillSeries::DateWeekday, 1.0, &[61.25, 62.25]);
    assert_eq!(weekday::add_workdays(45352.5, 500_000), Some(745352.5));
    assert!(!weekday::add_workdays(45352.5, 9_007_199_254_740_991)
        .is_some_and(valid_date_serial));
}

#[test]
fn yearly_steps_use_the_original_anchor_and_do_not_promote_february_28() {
    assert_series(serial(2024, 2, 29) + 0.5, AutoFillSeries::DateYear, 1.0,
        &[serial(2025, 2, 28) + 0.5, serial(2026, 2, 28) + 0.5,
          serial(2027, 2, 28) + 0.5, serial(2028, 2, 29) + 0.5]);
    assert_series(serial(2024, 2, 29), AutoFillSeries::DateYear, -2.0,
        &[serial(2022, 2, 28), serial(2020, 2, 29)]);
    assert_series(serial(2023, 2, 28), AutoFillSeries::DateYear, 1.0,
        &[serial(2024, 2, 28), serial(2025, 2, 28)]);
}

#[test]
fn yearly_serial_zero_and_fake_leap_day_have_explicit_supported_boundaries() {
    assert_series(0.25, AutoFillSeries::DateYear, 1.0,
        &[serial(1900, 12, 31) + 0.25, serial(1901, 12, 31) + 0.25]);
    assert_series(60.5, AutoFillSeries::DateYear, 1.0,
        &[serial(1901, 2, 28) + 0.5, serial(1902, 2, 28) + 0.5]);
    assert_series(60.5, AutoFillSeries::DateYear, 4.0, &[serial(1904, 2, 29) + 0.5]);
    assert_series(serial(1900, 12, 31), AutoFillSeries::DateYear, -1.0, &[0.0]);
}

#[test]
fn explicit_calendar_parameters_and_date_bounds_reject_atomically() {
    for series in [AutoFillSeries::DateWeekday, AutoFillSeries::DateYear] {
        for step in [0.0, 0.5, f64::NAN, f64::INFINITY, 9_007_199_254_740_992.0] {
            let mut book = Workbook::new();
            book.set_cell(0, "A1", Value::Number(45352.5));
            assert!(book.apply_auto_fill(&request(series, step, 2)).is_err());
            assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Null);
        }
        for (start, step) in [(-1.0, 1.0), (MAX_DATE_SERIAL + 1.0, -1.0),
            (MAX_DATE_SERIAL + 0.5, 1.0), (0.5, -1.0),
            (45352.5, 9_007_199_254_740_991.0)] {
            let mut book = Workbook::new();
            book.set_cell(0, "A1", Value::Number(start));
            book.set_cell(0, "A2", Value::Number(901.0));
            assert!(book.apply_auto_fill(&request(series, step, 2)).is_err());
            assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(901.0));
        }
    }
    assert!(valid_date_serial(MAX_DATE_SERIAL + 0.5));
    assert_series(MAX_DATE_SERIAL + 0.5, AutoFillSeries::DateWeekday, -1.0,
        &[MAX_DATE_SERIAL - 0.5]);
    assert_series(MAX_DATE_SERIAL + 0.5, AutoFillSeries::DateYear, -1.0,
        &[serial(9998, 12, 31) + 0.5]);
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(serial(9998, 12, 31) + 0.5));
    book.set_cell(0, "A2", Value::Number(901.0));
    // A2 is individually valid; A3 overflows, so no finite prefix may leak.
    assert!(book.apply_auto_fill(&request(AutoFillSeries::DateYear, 1.0, 2)).is_err());
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(901.0));
}

#[test]
fn new_calendar_units_reject_formula_multiple_sources_and_reverse_directions() {
    for series in [AutoFillSeries::DateWeekday, AutoFillSeries::DateYear] {
        let mut book = Workbook::new();
        book.set_formula(0, "A1", "=45352");
        assert!(book.apply_auto_fill(&request(series, 1.0, 2)).is_err());
        book.set_cell(0, "A1", Value::Number(45352.0));
        let mut multiple = request(series, 1.0, 3);
        multiple.source_range = range("A1", "A2");
        assert!(book.apply_auto_fill(&multiple).is_err());
        let mut reverse = request(series, 1.0, 3);
        reverse.source_range = range("A4", "A4");
        reverse.direction = AutoFillDirection::Up;
        book.set_cell(0, "A4", Value::Number(45352.0));
        assert!(book.apply_auto_fill(&reverse).is_err());
        assert!(book.infer_auto_fill_request(request(series, 1.0, 2)).is_err());
        let mut right = request(series, -1.0, 2);
        right.direction = AutoFillDirection::Right;
        right.target_range = range("A1", "C1");
        assert_eq!(book.apply_auto_fill(&right).unwrap().written, 2);
    }
}
