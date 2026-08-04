//! Dispatches date calendar formula functions.

use super::*;

pub(super) fn eval_fn_date_calendar(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "WEEKDAY" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let return_type = if args.len() == 2 {
                let rt = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = rt {
                    return Value::Error(e);
                }
                match coerce_to_number(&rt) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            // Sunday=0..Saturday=6 in our intermediate.
            let dow = ((serial.floor() as i64) + 4).rem_euclid(7);
            let result = match return_type {
                1 => dow + 1,             // Sun=1..Sat=7
                2 => ((dow + 6) % 7) + 1, // Mon=1..Sun=7
                3 => (dow + 6) % 7,       // Mon=0..Sun=6
                // Excel reports an invalid WEEKDAY return_type as #NUM!,
                // including an omitted slot coerced to numeric zero.
                _ => return Value::Error(ValueError::Overflow),
            };
            Value::Number(result as f64)
        }
        // WEEKNUM(serial[, return_type]).
        //
        // Simple "Excel default" semantics: week 1 starts Jan 1 of the
        // serial's year. Each new week begins on the configured start day
        // (Sun for return_type=1, Mon for return_type=2). Other return_type
        // values → InvalidValue (narrow support — ISO 8601 week number is
        // intentionally out of scope here).
        "WEEKNUM" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let serial = match coerce_to_number(&v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let return_type = if args.len() == 2 {
                let rt = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = rt {
                    return Value::Error(e);
                }
                match coerce_to_number(&rt) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            // start_offset: weekday index that counts as "0" within the week.
            // return_type=1 → week starts Sunday (Sun=0); return_type=2 → Mon=0.
            let start_offset: i64 = match return_type {
                1 => 0, // Sunday
                2 => 1, // Monday
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let (y, _, _) = date_from_serial(serial);
            let jan1 = date_serial(y, 1, 1);
            // Sunday=0..Saturday=6 for jan1.
            let jan1_dow = ((jan1.floor() as i64) + 4).rem_euclid(7);
            // Day-of-year, 0-based.
            let doy = serial.floor() as i64 - jan1.floor() as i64;
            // Position within week 1 of jan1: how many days into the week
            // jan1 sits (e.g. if week starts Sun and jan1 is Tue, jan1 is
            // at offset 2 → week 1 has 5 remaining days, week 2 starts on
            // day 5).
            let jan1_in_week = (jan1_dow - start_offset).rem_euclid(7);
            let week = (doy + jan1_in_week) / 7 + 1;
            Value::Number(week as f64)
        }
        // EOMONTH(start, months) — last day of the month `months` after start.
        "EOMONTH" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            match (coerce_to_number(&s), coerce_to_number(&m)) {
                (Some(start), Some(months)) => {
                    let (y, mo, _) = date_from_serial(start);
                    let (ty, tm) = shift_year_month(y, mo, months.trunc() as i64);
                    let dim = days_in_month(ty, tm);
                    Value::Number(date_serial(ty, tm, 1) + (dim as f64) - 1.0)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // EDATE(start, months) — same calendar day, `months` later.
        // If the target month has fewer days, clamp to month end.
        "EDATE" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            match (coerce_to_number(&s), coerce_to_number(&m)) {
                (Some(start), Some(months)) => {
                    let (y, mo, d) = date_from_serial(start);
                    let (ty, tm) = shift_year_month(y, mo, months.trunc() as i64);
                    let dim = days_in_month(ty, tm);
                    let td = d.min(dim);
                    Value::Number(date_serial(ty, tm, td))
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // DAYS(end, start) → end - start as integer day count.
        "DAYS" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let e = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(er) = e {
                return Value::Error(er);
            }
            let s = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(er) = s {
                return Value::Error(er);
            }
            match (coerce_to_number(&e), coerce_to_number(&s)) {
                (Some(end), Some(start)) => Value::Number(end.floor() - start.floor()),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // DATEDIF(start, end, unit). start > end is rejected as Overflow
        // (matches Excel's #NUM!). Unit is text and case-insensitive in
        // Excel; we accept upper-case to stay consistent with the parser's
        // string handling.
        _ => unreachable!(),
    }
}
