use super::*;

fn serial(year: i32, month: u32, day: u32) -> f64 {
    excel_date_parts_to_serial(ExcelDateParts { year, month, day, fraction: 0.0 }).unwrap()
}

#[test]
fn periods_use_calendar_boundaries_at_a_leap_day() {
    let today = serial(2024, 2, 29);
    for (period, start, end) in [
        (CalendarPeriod::Day(-1), today - 1.0, today),
        (CalendarPeriod::Day(0), today, today + 1.0),
        (CalendarPeriod::Day(1), today + 1.0, today + 2.0),
        (CalendarPeriod::Week(-1), serial(2024, 2, 18), serial(2024, 2, 25)),
        (CalendarPeriod::Week(0), serial(2024, 2, 25), serial(2024, 3, 3)),
        (CalendarPeriod::Week(1), serial(2024, 3, 3), serial(2024, 3, 10)),
        (CalendarPeriod::Month(-1), serial(2024, 1, 1), serial(2024, 2, 1)),
        (CalendarPeriod::Month(0), serial(2024, 2, 1), serial(2024, 3, 1)),
        (CalendarPeriod::Month(1), serial(2024, 3, 1), serial(2024, 4, 1)),
        (CalendarPeriod::Quarter(-1), serial(2023, 10, 1), serial(2024, 1, 1)),
        (CalendarPeriod::Quarter(0), serial(2024, 1, 1), serial(2024, 4, 1)),
        (CalendarPeriod::Quarter(1), serial(2024, 4, 1), serial(2024, 7, 1)),
        (CalendarPeriod::Year(-1), serial(2023, 1, 1), serial(2024, 1, 1)),
        (CalendarPeriod::Year(0), serial(2024, 1, 1), serial(2025, 1, 1)),
        (CalendarPeriod::Year(1), serial(2025, 1, 1), serial(2026, 1, 1)),
        (CalendarPeriod::YearToDate, serial(2024, 1, 1), today + 1.0),
        (CalendarPeriod::Last7Days, today - 6.0, today + 1.0),
    ] {
        assert_eq!(period.bounds_at(today + 0.75), Some((start, end)));
    }
}

#[test]
fn sunday_month_quarter_and_year_rollovers_are_not_fixed_day_lengths() {
    let sunday = serial(2024, 12, 29);
    assert_eq!(CalendarPeriod::Week(0).bounds_at(sunday), Some((sunday, sunday + 7.0)));
    assert_eq!(CalendarPeriod::Week(0).bounds_at(sunday + 6.9), Some((sunday, sunday + 7.0)));
    for (period, today, start, end) in [
        (CalendarPeriod::Quarter(1), serial(2024, 12, 31), serial(2025, 1, 1), serial(2025, 4, 1)),
        (CalendarPeriod::Quarter(-1), serial(2025, 1, 1), serial(2024, 10, 1), serial(2025, 1, 1)),
        (CalendarPeriod::Month(1), serial(2025, 1, 31), serial(2025, 2, 1), serial(2025, 3, 1)),
        (CalendarPeriod::YearToDate, serial(2025, 1, 1), serial(2025, 1, 1), serial(2025, 1, 2)),
    ] {
        assert_eq!(period.bounds_at(today), Some((start, end)));
    }
}

#[test]
fn native_calendar_retains_phantom_day_and_extended_end_bounds() {
    assert_eq!(CalendarPeriod::Month(0).bounds_at(60.5), Some((32.0, 61.0)));
    assert_eq!(CalendarPeriod::Quarter(0).bounds_at(60.0), Some((1.0, 92.0)));
    assert_eq!(CalendarPeriod::Month(0).bounds_at(0.0), Some((1.0, 32.0)));
    let last = serial(9999, 12, 31);
    assert_eq!(CalendarPeriod::Year(0).bounds_at(last), Some((serial(9999, 1, 1), last + 1.0)));
    assert!(CalendarPeriod::Month(1).bounds_at(last).unwrap().0 > last);
    for invalid in [-1.0, last + 1.0, f64::NAN, f64::INFINITY] {
        assert!(CalendarPeriod::Day(0).bounds_at(invalid).is_none());
    }
}
