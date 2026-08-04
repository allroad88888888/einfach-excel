//! Dispatches date workday formula functions.

use super::*;

pub(super) fn eval_fn_date_workday(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"NETWORKDAYS" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (start, end) = match networkdays_endpoints(&args[0], &args[1], provider) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            let holidays = match collect_holidays(args.get(2), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            // Default weekend mask: Sat+Sun (mask indexed Mon=0..Sun=6).
            let weekend = [false, false, false, false, false, true, true];
            Value::Number(count_workdays(start, end, &weekend, &holidays) as f64)
        }

        // NETWORKDAYS.INTL(start, end[, weekend[, holidays]]) — like
        // NETWORKDAYS but with a configurable weekend. `weekend` is
        // either an integer code (1..7 for two-day weekends, 11..17
        // for single-day weekends) or a 7-character mask of '0'/'1'
        // with char[0] = Monday. An all-'1' mask (no working days)
        // returns InvalidValue, mirroring Excel's #VALUE!.
        "NETWORKDAYS.INTL" => {
            if args.len() < 2 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (start, end) = match networkdays_endpoints(&args[0], &args[1], provider) {
                Ok(v) => v,
                Err(e) => return Value::Error(e),
            };
            let weekend = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match parse_weekend_arg(&v) {
                    Ok(w) => w,
                    Err(e) => return Value::Error(e),
                }
            } else {
                [false, false, false, false, false, true, true]
            };
            let holidays = match collect_holidays(args.get(3), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            Value::Number(count_workdays(start, end, &weekend, &holidays) as f64)
        }

        // WORKDAY(start, days[, holidays]) — advance `days` working
        // days (Mon..Fri, skipping holidays) from `start`, returning
        // the resulting serial as a Number. `days` may be negative.
        // If `days == 0`, returns `start.floor()` regardless of
        // whether `start` itself is a weekend/holiday.
        "WORKDAY" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let start = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = start {
                return Value::Error(e);
            }
            let days = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = days {
                return Value::Error(e);
            }
            let start_n = match coerce_to_number(&start) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let days_n = match coerce_to_number(&days) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let holidays = match collect_holidays(args.get(2), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            let weekend = [false, false, false, false, false, true, true];
            Value::Number(advance_workdays(start_n, days_n, &weekend, &holidays) as f64)
        }

        // WORKDAY.INTL(start, days[, weekend[, holidays]]) — like
        // WORKDAY but with a configurable weekend (same parsing as
        // NETWORKDAYS.INTL: numeric code or 7-char '0'/'1' mask).
        "WORKDAY.INTL" => {
            if args.len() < 2 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let start = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = start {
                return Value::Error(e);
            }
            let days = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = days {
                return Value::Error(e);
            }
            let start_n = match coerce_to_number(&start) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let days_n = match coerce_to_number(&days) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let weekend = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match parse_weekend_arg(&v) {
                    Ok(w) => w,
                    Err(e) => return Value::Error(e),
                }
            } else {
                [false, false, false, false, false, true, true]
            };
            let holidays = match collect_holidays(args.get(3), provider) {
                Ok(h) => h,
                Err(e) => return Value::Error(e),
            };
            Value::Number(advance_workdays(start_n, days_n, &weekend, &holidays) as f64)
        }

        // ISOWEEKNUM(serial) — ISO 8601 week number (1..53). Weeks
        // start Monday; week 1 of an ISO year is the week containing
        // Jan 4 (equivalently, the week containing the year's first
        // Thursday). Dates near year boundaries can therefore belong
        // to the previous or next ISO year; we resolve that by
        // recomputing against year-1 (when the date falls before
        // week 1 starts) or year+1 (when the date falls past the
        // computed year's last week).
        "ISOWEEKNUM" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n.floor() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            Value::Number(iso_week_number(serial) as f64)
        }

        // === Dynamic-array (spill) functions ===
        // Each returns `Value::Array(Arc::new(ArrayData::new(...)))`; the
        // Sheet layer detects Array results and registers a spill range.

        // SEQUENCE(rows[, cols[, start[, step]]]) — Build a numeric grid of
        // the given shape with values `start + (i*cols + j) * step`.
        // note: hard-capped at 1_048_576 total elements (matches Excel's
        // worksheet row count); larger requests surface #VALUE! rather
        // than attempt the allocation.
        "DAYS360" => date_days360(args, provider),

        // *.PRECISE — Excel 2010 aliases of the existing functions.
        // The "precise" suffix exists because the legacy ERF / ERFC
        // had an awkward two-arg form; the modern *.PRECISE name
        // disambiguates. We compute identically either way.
                _ => unreachable!(),
    }
}
