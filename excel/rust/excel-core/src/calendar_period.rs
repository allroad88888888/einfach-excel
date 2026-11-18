//! Calendar intervals shared by conditional formatting and relative-date filters.
use crate::date_serial::{excel_date_parts_to_serial, excel_serial_to_date_parts,
    valid_date_serial, weekday_sunday_indexed, ExcelDateParts};
use chrono::{Datelike, Local};

#[derive(Clone, Copy)]
pub(crate) enum CalendarPeriod {
    Day(i32), Week(i32), Month(i32), Quarter(i32), Year(i32), YearToDate, Last7Days,
}

pub(crate) fn local_today_serial() -> Option<f64> {
    let date = Local::now().date_naive();
    excel_date_parts_to_serial(ExcelDateParts {
        year: date.year(), month: date.month(), day: date.day(), fraction: 0.0,
    })
}

fn month_start(today: f64, offset: i32) -> Option<f64> {
    let date = excel_serial_to_date_parts(today)?;
    let month = (date.month as i32 - 1).checked_add(offset)?;
    excel_date_parts_to_serial(ExcelDateParts {
        year: date.year.checked_add(month.div_euclid(12))?,
        month: (month.rem_euclid(12) + 1) as u32, day: 1, fraction: 0.0,
    })
}

impl CalendarPeriod {
    /// Half-open interval; callers intersect it with their own supported date domain.
    /// Bounds may cross 1900/9999 so partial periods remain representable.
    pub(crate) fn bounds_at(self, today: f64) -> Option<(f64, f64)> {
        if !valid_date_serial(today) { return None; }
        let today = today.floor();
        let date = excel_serial_to_date_parts(today)?;
        let months = |offset: i32, count: i32| Some((month_start(today, offset)?,
            month_start(today, offset.checked_add(count)?)?));
        Some(match self {
            Self::Day(offset) => (today + f64::from(offset), today + f64::from(offset) + 1.0),
            Self::Week(offset) => {
                let start = today - weekday_sunday_indexed(today as i64) as f64
                    + f64::from(offset) * 7.0;
                (start, start + 7.0)
            },
            Self::Month(offset) => return months(offset, 1),
            Self::Quarter(offset) => return months(offset.checked_mul(3)?
                .checked_sub(((date.month - 1) % 3) as i32)?, 3),
            Self::Year(offset) => return months(offset.checked_mul(12)?
                .checked_add(1 - date.month as i32)?, 12),
            Self::YearToDate => (month_start(today, 1 - date.month as i32)?, today + 1.0),
            Self::Last7Days => (today - 6.0, today + 1.0),
        })
    }
}

#[cfg(test)]
#[path = "calendar_period_tests.rs"]
mod tests;
