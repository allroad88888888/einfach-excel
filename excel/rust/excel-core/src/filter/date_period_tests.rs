use super::*;
use crate::filter::prepared::PreparedFilter;
use crate::date_serial::{excel_date_parts_to_serial, ExcelDateParts};
use einfach_core::Value;
use std::collections::HashMap;

fn serial(year: i32, month: u32, day: u32) -> f64 {
    excel_date_parts_to_serial(ExcelDateParts { year, month, day, fraction: 0.0 }).unwrap()
}

#[test]
fn every_wire_period_maps_to_its_calendar_interval_including_ytd() {
    let today = serial(2024, 2, 29);
    for (wire, start, end) in [
        ("today", today, today + 1.0), ("yesterday", today - 1.0, today),
        ("tomorrow", today + 1.0, today + 2.0),
        ("last-week", serial(2024, 2, 18), serial(2024, 2, 25)),
        ("this-week", serial(2024, 2, 25), serial(2024, 3, 3)),
        ("next-week", serial(2024, 3, 3), serial(2024, 3, 10)),
        ("last-month", serial(2024, 1, 1), serial(2024, 2, 1)),
        ("this-month", serial(2024, 2, 1), serial(2024, 3, 1)),
        ("next-month", serial(2024, 3, 1), serial(2024, 4, 1)),
        ("last-quarter", serial(2023, 10, 1), serial(2024, 1, 1)),
        ("this-quarter", serial(2024, 1, 1), serial(2024, 4, 1)),
        ("next-quarter", serial(2024, 4, 1), serial(2024, 7, 1)),
        ("last-year", serial(2023, 1, 1), serial(2024, 1, 1)),
        ("this-year", serial(2024, 1, 1), serial(2025, 1, 1)),
        ("next-year", serial(2025, 1, 1), serial(2026, 1, 1)),
        ("year-to-date", serial(2024, 1, 1), today + 1.0),
    ] {
        let period: FilterDatePeriod = serde_json::from_str(&format!("\"{wire}\"")).unwrap();
        assert_eq!(period.bounds_at(today), Some((start, end)), "{wire}");
        let rules = [ColumnFilterRule::DatePeriod { col_index: 0, period }];
        let values: HashMap<_, _> = [start - 0.01, start, end - 0.01, end]
            .into_iter().enumerate().map(|(row, n)| ((row as u32, 0), Value::Number(n))).collect();
        let prepared = PreparedFilter::new(FilterCriteria::Flat(&rules), 0..=3, &values, Some(today));
        assert_eq!((0..=3).filter(|row| prepared.matches(*row, &values)).collect::<Vec<_>>(),
            vec![1, 2], "{wire}");
    }
}

#[test]
fn phantom_day_and_typed_values_survive_preparation_without_string_coercion() {
    let rules = [ColumnFilterRule::DatePeriod { col_index: 0, period: FilterDatePeriod::ThisMonth }];
    let values: HashMap<_, _> = [Value::Number(59.), Value::Number(60.), Value::Number(60.9),
        Value::Number(61.), Value::Number(0.), Value::Number(-1.), Value::Number(f64::NAN),
        Value::Number(f64::INFINITY), Value::Text("60".into()), Value::Boolean(true),
        Value::Null, Value::Text("1900-02-29".into())].into_iter().enumerate()
        .map(|(row, value)| ((row as u32, 0), value)).collect();
    let prepared = PreparedFilter::new(FilterCriteria::Flat(&rules), 0..=11, &values, Some(60.));
    assert_eq!((0..=11).filter(|row| prepared.matches(*row, &values)).collect::<Vec<_>>(), vec![0, 1, 2]);
    let next = PreparedFilter::new(FilterCriteria::Flat(&rules), 0..=11, &values, Some(61.));
    assert_eq!((0..=11).filter(|row| next.matches(*row, &values)).collect::<Vec<_>>(), vec![3]);
}

#[test]
fn date_filter_domain_clamps_partial_periods_at_both_supported_ends() {
    let end = MAX_DATE_SERIAL + 1.0;
    assert_eq!(FilterDatePeriod::LastYear.bounds_at(1.), Some((1., 1.)));
    assert_eq!(FilterDatePeriod::Yesterday.bounds_at(1.), Some((1., 1.)));
    assert_eq!(FilterDatePeriod::NextYear.bounds_at(MAX_DATE_SERIAL), Some((end, end)));
    assert_eq!(FilterDatePeriod::Tomorrow.bounds_at(MAX_DATE_SERIAL), Some((end, end)));
    assert_eq!(FilterDatePeriod::ThisMonth.bounds_at(MAX_DATE_SERIAL),
        Some((serial(9999, 12, 1), end)));
    for invalid in [0., -1., f64::NAN, f64::INFINITY, end] {
        assert!(FilterDatePeriod::Today.bounds_at(invalid).is_none());
    }
    let rules = [ColumnFilterRule::DatePeriod { col_index: 0, period: FilterDatePeriod::ThisYear }];
    for (today, matching, excluded) in [(1., 1., 0.99), (MAX_DATE_SERIAL, end - 0.01, end)] {
        let values = HashMap::from([((0, 0), Value::Number(matching)), ((1, 0), Value::Number(excluded))]);
        let prepared = PreparedFilter::new(FilterCriteria::Flat(&rules), 0..=1, &values, Some(today));
        assert!(prepared.matches(0, &values));
        assert!(!prepared.matches(1, &values));
    }
}
