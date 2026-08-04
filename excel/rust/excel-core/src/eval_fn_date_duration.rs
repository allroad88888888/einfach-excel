//! Dispatches date duration formula functions.

use super::*;

pub(super) fn eval_fn_date_duration(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"DATEDIF" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            let e = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(er) = e {
                return Value::Error(er);
            }
            let u = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(er) = u {
                return Value::Error(er);
            }
            let start = match coerce_to_number(&s) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let end = match coerce_to_number(&e) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            if start > end {
                return Value::Error(ValueError::Overflow);
            }
            let unit = coerce_to_text(&u).to_ascii_uppercase();
            let (y1, m1, d1) = date_from_serial(start);
            let (y2, m2, d2) = date_from_serial(end);
            match unit.as_str() {
                "D" => Value::Number(end.floor() - start.floor()),
                "Y" => {
                    let mut yrs = (y2 - y1) as i64;
                    if (m2, d2) < (m1, d1) {
                        yrs -= 1;
                    }
                    Value::Number(yrs as f64)
                }
                "M" => {
                    let mut months = (y2 - y1) as i64 * 12 + (m2 as i64 - m1 as i64);
                    if d2 < d1 {
                        months -= 1;
                    }
                    Value::Number(months as f64)
                }
                "YM" => {
                    // Months between, ignoring years.
                    let mut months = m2 as i64 - m1 as i64;
                    if d2 < d1 {
                        months -= 1;
                    }
                    if months < 0 {
                        months += 12;
                    }
                    Value::Number(months as f64)
                }
                "YD" => {
                    // Days between, ignoring years: align end's (m,d) to
                    // start's year (or year+1 if end's (m,d) precedes start's).
                    let anniv_year = if (m2, d2) >= (m1, d1) { y1 } else { y1 + 1 };
                    let anniv = date_serial(anniv_year, m2, d2.min(days_in_month(anniv_year, m2)));
                    Value::Number((anniv - start.floor()).abs())
                }
                "MD" => {
                    // Days between, ignoring months and years.
                    // If d2 >= d1, simply d2 - d1. Otherwise borrow days from
                    // the previous month relative to end.
                    if d2 >= d1 {
                        Value::Number((d2 - d1) as f64)
                    } else {
                        let (py, pm) = shift_year_month(y2, m2, -1);
                        let pm_days = days_in_month(py, pm);
                        Value::Number((pm_days + d2 - d1) as f64)
                    }
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }
        // DATEVALUE(text) — ISO 8601 only: "YYYY-MM-DD" or "YYYY/MM/DD".
        "DATEVALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = match v {
                Value::Text(s) => s,
                Value::Null => return Value::Error(ValueError::WrongType),
                other => coerce_to_text(&other),
            };
            let parts: Vec<&str> = if s.contains('-') {
                s.split('-').collect()
            } else if s.contains('/') {
                s.split('/').collect()
            } else {
                return Value::Error(ValueError::InvalidValue);
            };
            if parts.len() != 3 {
                return Value::Error(ValueError::InvalidValue);
            }
            let y: i32 = match parts[0].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let m: u32 = match parts[1].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let d: u32 = match parts[2].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            if m == 0 || m > 12 || d == 0 || d > days_in_month(y, m) {
                return Value::Error(ValueError::InvalidValue);
            }
            Value::Number(date_serial(y, m, d))
        }
        // TIMEVALUE(text) — "HH:MM" or "HH:MM:SS".
        "TIMEVALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = match v {
                Value::Text(s) => s,
                Value::Null => return Value::Error(ValueError::WrongType),
                other => coerce_to_text(&other),
            };
            let parts: Vec<&str> = s.split(':').collect();
            if parts.len() < 2 || parts.len() > 3 {
                return Value::Error(ValueError::InvalidValue);
            }
            let h: f64 = match parts[0].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let m: f64 = match parts[1].parse() {
                Ok(n) => n,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let sec: f64 = if parts.len() == 3 {
                match parts[2].parse() {
                    Ok(n) => n,
                    Err(_) => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                0.0
            };
            if h < 0.0 || m < 0.0 || sec < 0.0 {
                return Value::Error(ValueError::InvalidValue);
            }
            Value::Number((h * 3600.0 + m * 60.0 + sec) / 86400.0)
        }
        // YEARFRAC(start, end[, basis]) — fraction of a year between dates.
        //
        // Basis approximations:
        //   0 = US 30/360 (simple form, no end-of-month rule)
        //   1 = actual/actual (uses actual days / 365 — approximate)
        //   2 = actual/360
        //   3 = actual/365
        //   4 = European 30/360 (equivalent to 0 for our simple form)
        "YEARFRAC" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = b {
                return Value::Error(e);
            }
            let basis = if args.len() == 3 {
                let bx = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = bx {
                    return Value::Error(e);
                }
                match coerce_to_number(&bx) {
                    Some(n) => n as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0
            };
            let (start, end) = match (coerce_to_number(&a), coerce_to_number(&b)) {
                (Some(s), Some(e)) => {
                    if s <= e {
                        (s, e)
                    } else {
                        (e, s)
                    }
                }
                _ => return Value::Error(ValueError::WrongType),
            };
            let result = match basis {
                0 | 4 => {
                    let (y1, m1, d1) = date_from_serial(start);
                    let (y2, m2, d2) = date_from_serial(end);
                    let num = (y2 - y1) as f64 * 360.0
                        + (m2 as f64 - m1 as f64) * 30.0
                        + (d2 as f64 - d1 as f64);
                    num / 360.0
                }
                1 => (end - start) / 365.0,
                2 => (end - start) / 360.0,
                3 => (end - start) / 365.0,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            Value::Number(result)
        }

        // === Statistical extensions ===
        //
        // AVERAGEA(...) — variadic. Like AVERAGE but Boolean(true) = 1,
        // Boolean(false) = 0, Text = 0 (all count toward the denominator).
        // Null is NOT counted (matches Excel's "empty cell" handling).
        // Errors propagate.
                _ => unreachable!(),
    }
}
