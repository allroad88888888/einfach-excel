//! Dispatches date time formula functions.

use super::*;

pub(super) fn eval_fn_date_time(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"HOUR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number((frac * 24.0).floor())
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // MINUTE(serial) — extract minute 0..59.
        "MINUTE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number(((frac * 1440.0).floor() as i64 % 60) as f64)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // SECOND(serial) — extract second 0..59. Round (not floor) to avoid
        // drift from binary-fraction representation of times.
        "SECOND" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let frac = n - n.floor();
                    Value::Number(((frac * 86400.0).round() as i64 % 60) as f64)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // TIME(h, m, s) → fractional day. Excel allows wrap-around
        // (TIME(25,0,0) = 25/24); negative components → InvalidValue.
        "TIME" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let h = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = h {
                return Value::Error(e);
            }
            let m = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = m {
                return Value::Error(e);
            }
            let s = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = s {
                return Value::Error(e);
            }
            match (
                coerce_to_number(&h),
                coerce_to_number(&m),
                coerce_to_number(&s),
            ) {
                (Some(h), Some(m), Some(s)) => {
                    if h < 0.0 || m < 0.0 || s < 0.0 {
                        return Value::Error(ValueError::InvalidValue);
                    }
                    Value::Number((h * 3600.0 + m * 60.0 + s) / 86400.0)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // WEEKDAY(serial[, return_type]).
        //
        // Epoch note: this codebase uses 1970-01-01 = serial 0 (Unix-style),
        // not Excel's 1900 epoch. 1970-01-01 was a Thursday, so the
        // Sunday-indexed day-of-week is `((floor(serial)) + 4) mod 7`.
                _ => unreachable!(),
    }
}
