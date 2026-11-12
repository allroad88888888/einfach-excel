use super::*;
use serde_json::json;

fn serial(year: i32, month: u32, day: u32) -> f64 {
    excel_date_parts_to_serial(ExcelDateParts { year, month, day, fraction: 0.0 }).unwrap()
}

fn rule(period: &str, today: f64) -> TimePeriodRule {
    let mut rule = TimePeriodRule::parse(&json!({"kind":"time-period", "period":period,
        "format":{"bold":true}}).to_string()).unwrap();
    assert!(rule.resolve(Some(today)));
    rule
}

#[test]
fn every_period_uses_inclusive_days_and_exclusive_next_day() {
    let today = serial(2024, 2, 29);
    for (period, first, end) in [
        ("today", today, today + 1.0),
        ("yesterday", today - 1.0, today),
        ("tomorrow", today + 1.0, today + 2.0),
        ("last7Days", today - 6.0, today + 1.0),
        ("thisWeek", serial(2024, 2, 25), serial(2024, 3, 3)),
        ("lastWeek", serial(2024, 2, 18), serial(2024, 2, 25)),
        ("nextWeek", serial(2024, 3, 3), serial(2024, 3, 10)),
        ("thisMonth", serial(2024, 2, 1), serial(2024, 3, 1)),
        ("lastMonth", serial(2024, 1, 1), serial(2024, 2, 1)),
        ("nextMonth", serial(2024, 3, 1), serial(2024, 4, 1)),
    ] {
        let rule = rule(period, today);
        assert!(!rule.matches(first - 0.00001), "{period} before start");
        assert!(rule.matches(first), "{period} start");
        assert!(rule.matches(end - 0.00001), "{period} time on last day");
        assert!(!rule.matches(end), "{period} end");
    }
}

#[test]
fn months_cross_years_without_thirty_day_approximations() {
    for (period, today, start, end) in [
        ("lastMonth", serial(2025, 1, 31), serial(2024, 12, 1), serial(2025, 1, 1)),
        ("nextMonth", serial(2025, 12, 31), serial(2026, 1, 1), serial(2026, 2, 1)),
        ("thisMonth", serial(2025, 2, 28), serial(2025, 2, 1), serial(2025, 3, 1)),
    ] {
        let rule = rule(period, today);
        assert_eq!(rule.bounds, Some((start, end)));
    }
}

#[test]
fn sunday_starts_the_week_and_the_date_is_resolved_again() {
    let sunday = serial(2026, 11, 15);
    assert_eq!(rule("thisWeek", sunday).bounds, Some((sunday, sunday + 7.0)));
    assert_eq!(rule("thisWeek", sunday + 1.0).bounds, Some((sunday, sunday + 7.0)));
    let mut dynamic = rule("today", sunday);
    assert!(dynamic.matches(sunday + 0.9));
    dynamic.resolve(Some(sunday + 1.0));
    assert!(!dynamic.matches(sunday));
    assert!(dynamic.matches(sunday + 1.0));
    assert!(!dynamic.resolve(None));
    assert!(!dynamic.matches(sunday + 1.0));
}

#[test]
fn excel_fake_leap_day_and_upper_bound_stay_in_the_native_date_domain() {
    let february = rule("thisMonth", 60.0);
    assert!(february.matches(60.75));
    assert!(!february.matches(61.0));
    let upper = rule("thisMonth", serial(9999, 12, 31));
    assert!(upper.matches(serial(9999, 12, 31) + 0.5));
    for number in [-1.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 2_958_466.0] {
        assert!(!upper.matches(number));
    }
}

#[test]
fn unknown_period_fields_and_invalid_options_are_rejected() {
    let base = json!({"kind":"time-period", "period":"today", "format":{"bold":true}});
    for (key, value) in [
        ("period", json!("nextYear")), ("period", json!(1)), ("enabled", json!("true")),
        ("operator", json!("gt")), ("kind", json!("formula")),
    ] {
        let mut invalid = base.clone();
        invalid[key] = value;
        assert!(TimePeriodRule::parse(&invalid.to_string()).is_err());
    }
}
