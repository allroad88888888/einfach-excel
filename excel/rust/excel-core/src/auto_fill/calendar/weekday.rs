//! Workday offsets use full Excel-serial weeks plus at most one weekend crossing.
use crate::date_serial::weekday_sunday_indexed;

pub(super) fn add_workdays(anchor: f64, offset: i64) -> Option<f64> {
    let mut day = anchor.floor() as i64;
    let fraction = anchor - day as f64;
    if offset == 0 { return Some(anchor); }
    let forward = offset > 0;
    let mut remaining = offset.checked_abs()?;
    let mut weekday = weekday_sunday_indexed(day);
    if weekday == 0 || weekday == 6 {
        let adjustment = if forward {
            if weekday == 0 { 1 } else { 2 }
        } else if weekday == 0 { -2 } else { -1 };
        day = day.checked_add(adjustment)?;
        weekday = weekday_sunday_indexed(day);
        remaining -= 1;
    }
    let remainder = remaining % 5;
    let mut delta = (remaining / 5).checked_mul(7)?.checked_add(remainder)?;
    if (forward && weekday + remainder > 5) || (!forward && weekday - remainder < 1) {
        delta = delta.checked_add(2)?;
    }
    day = if forward { day.checked_add(delta)? } else { day.checked_sub(delta)? };
    Some(day as f64 + fraction)
}
