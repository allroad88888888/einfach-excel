use super::*;

pub(super) fn dow_monday_indexed(serial: i64) -> usize {
    // Sunday=0..Saturday=6 (since 1970-01-01 was Thursday → +4).
    let dow_sun = (serial + 4).rem_euclid(7);
    // Shift to Mon=0..Sun=6.
    ((dow_sun + 6) % 7) as usize
}

/// Resolve two `(start, end)` serial endpoints for NETWORKDAYS /
/// NETWORKDAYS.INTL, propagating cell-evaluation errors and surfacing
/// type errors when coercion fails.
pub(super) fn networkdays_endpoints(
    start_arg: &Expr,
    end_arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(i64, i64), ValueError> {
    let s = eval_expr_with_provider(start_arg, provider);
    if let Value::Error(e) = s {
        return Err(e);
    }
    let e = eval_expr_with_provider(end_arg, provider);
    if let Value::Error(er) = e {
        return Err(er);
    }
    let start = coerce_to_number(&s).ok_or(ValueError::WrongType)?.floor() as i64;
    let end = coerce_to_number(&e).ok_or(ValueError::WrongType)?.floor() as i64;
    Ok((start, end))
}

/// Parse a NETWORKDAYS.INTL / WORKDAY.INTL `weekend` argument. Returns
/// a Mon..Sun mask where `true` marks weekend days.
///
/// Accepted forms (matching Excel):
///   - Number 1..7   → two-day weekend block starting on a given day
///   - Number 11..17 → single-day weekend
///   - Text mask     → 7 chars of '0'/'1', char[0] = Monday
///
/// An all-`1` mask (no working days at all) is rejected as
/// InvalidValue, matching Excel's #VALUE! on the same input.
pub(super) fn parse_weekend_arg(v: &Value) -> Result<[bool; 7], ValueError> {
    if let Value::Text(s) = v {
        // Text mask path. 7 characters of '0'/'1', Mon..Sun.
        let bytes = s.as_bytes();
        if bytes.len() != 7 {
            return Err(ValueError::InvalidValue);
        }
        let mut mask = [false; 7];
        let mut all_weekend = true;
        for (i, c) in bytes.iter().enumerate() {
            match c {
                b'0' => {
                    all_weekend = false;
                }
                b'1' => {
                    mask[i] = true;
                }
                _ => return Err(ValueError::InvalidValue),
            }
        }
        if all_weekend {
            // All days marked weekend → no working days at all.
            return Err(ValueError::InvalidValue);
        }
        return Ok(mask);
    }
    let code = coerce_to_number(v).ok_or(ValueError::WrongType)?;
    if code.fract() != 0.0 {
        return Err(ValueError::InvalidValue);
    }
    let code = code as i64;
    // Excel two-day codes: 1 = Sat+Sun, 2 = Sun+Mon, ..., 7 = Fri+Sat.
    // Mask indices are Mon=0..Sun=6.
    let two_day_pairs: [[usize; 2]; 7] = [
        [5, 6], // 1: Sat+Sun
        [6, 0], // 2: Sun+Mon
        [0, 1], // 3: Mon+Tue
        [1, 2], // 4: Tue+Wed
        [2, 3], // 5: Wed+Thu
        [3, 4], // 6: Thu+Fri
        [4, 5], // 7: Fri+Sat
    ];
    if (1..=7).contains(&code) {
        let pair = two_day_pairs[(code - 1) as usize];
        let mut mask = [false; 7];
        mask[pair[0]] = true;
        mask[pair[1]] = true;
        return Ok(mask);
    }
    // Single-day codes 11..17: 11 = Sun, 12 = Mon, ..., 17 = Sat.
    if (11..=17).contains(&code) {
        // 11 → Sun (mask idx 6), 12 → Mon (mask idx 0), ..., 17 → Sat (mask idx 5).
        let day = ((code - 12).rem_euclid(7)) as usize; // 12→0..17→5, 11→6
        let mut mask = [false; 7];
        mask[day] = true;
        return Ok(mask);
    }
    Err(ValueError::InvalidValue)
}

/// Walk an optional holidays argument via `for_each_arg_value`,
/// collecting whole-day integer serials. Numeric cells are floored;
/// Null / Text / Boolean cells are silently skipped (mixed-type
/// holiday columns happen in practice). Errors *do* propagate — a
/// `#DIV/0!` lurking in the holidays range short-circuits the whole
/// function, matching Excel.
pub(super) fn collect_holidays(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
) -> Result<HashSet<i64>, ValueError> {
    let mut set = HashSet::new();
    let arg = match arg {
        Some(a) => a,
        None => return Ok(set),
    };
    let mut err: Option<ValueError> = None;
    for_each_arg_value(arg, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Error(e) => err = Some(e),
            Value::Number(n) => {
                set.insert(n.floor() as i64);
            }
            // Text / Boolean / Null inside a holidays range → lenient
            // skip. Excel raises #VALUE! on text holidays; we match
            // the more forgiving Google Sheets behaviour here so
            // sparse data doesn't blow up the formula.
            _ => {}
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    Ok(set)
}

/// Count whole-day workdays from `start` to `end` inclusive on both
/// ends. A workday is a serial whose Mon-indexed day-of-week is not
/// flagged in `weekend` AND whose serial is not in `holidays`. If
/// `start > end` the count is negated (Excel parity).
pub(super) fn count_workdays(start: i64, end: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> i64 {
    if start == end {
        return if weekend[dow_monday_indexed(start)] || holidays.contains(&start) {
            0
        } else {
            1
        };
    }
    let (a, b, sign) = if start <= end {
        (start, end, 1)
    } else {
        (end, start, -1)
    };
    let mut count: i64 = 0;
    let mut d = a;
    while d <= b {
        if !weekend[dow_monday_indexed(d)] && !holidays.contains(&d) {
            count += 1;
        }
        d += 1;
    }
    sign * count
}

/// Advance `days` working days from `start`. `days == 0` returns
/// `start` verbatim (Excel does *not* snap to the nearest workday).
/// Positive `days` steps forward, negative steps backward; in both
/// directions the step skips weekend days and any serial in
/// `holidays`.
pub(super) fn advance_workdays(start: i64, days: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> i64 {
    if days == 0 {
        return start;
    }
    let step: i64 = if days > 0 { 1 } else { -1 };
    let mut remaining = days.abs();
    let mut cur = start;
    while remaining > 0 {
        cur += step;
        if !weekend[dow_monday_indexed(cur)] && !holidays.contains(&cur) {
            remaining -= 1;
        }
    }
    cur
}

/// ISO 8601 week number (1..53). Weeks start Monday; week 1 of the
/// ISO year is the week containing Jan 4 (equivalently, the first
/// week with ≥4 days of the new year). Dates within the first few
/// days of January may belong to the *previous* ISO year (when the
/// date sits before that year's week 1 starts); dates within the
/// last few days of December may belong to the *next* ISO year (when
/// the date sits past the computed year's last week boundary).
pub(super) fn iso_week_number(serial: i64) -> i64 {
    // Helper: week-1 Monday for a given Gregorian year.
    fn week1_start(year: i32) -> i64 {
        let jan4 = date_serial(year, 1, 4) as i64;
        // Convert jan4's day-of-week to Mon=0..Sun=6.
        let dow_iso = dow_monday_indexed(jan4) as i64;
        jan4 - dow_iso
    }
    let (year, _, _) = date_from_serial(serial as f64);
    let start = week1_start(year);
    if serial < start {
        // Date is in the last ISO week of the previous Gregorian year.
        let prev_start = week1_start(year - 1);
        return (serial - prev_start) / 7 + 1;
    }
    // Could still be in week 1 of the next ISO year — check.
    let next_start = week1_start(year + 1);
    if serial >= next_start {
        return (serial - next_start) / 7 + 1;
    }
    (serial - start) / 7 + 1
}
