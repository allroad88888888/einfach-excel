//! Dispatches date basic formula functions.

use super::*;

pub(super) fn eval_fn_date_basic(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"TODAY" => {
            use chrono::{Datelike, Local};
            let today = Local::now().date_naive();
            Value::Number(date_serial(today.year(), today.month(), today.day()))
        }
        "NOW" => {
            // Whole+fractional day count. Fractional part = time-of-day / 86400.
            use chrono::{Datelike, Local, Timelike};
            let now = Local::now();
            let date = now.date_naive();
            let day_serial = date_serial(date.year(), date.month(), date.day());
            let secs_in_day = (now.hour() * 3600 + now.minute() * 60 + now.second()) as f64;
            Value::Number(day_serial + secs_in_day / 86_400.0)
        }
        "DATE" => {
            // DATE(year, month, day) — naive day-count via days-from-epoch.
            // Doesn't handle leap rules of pre-1582 Julian; accurate enough
            // for the demo's range.
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let y = coerce_to_number(&eval_expr_with_provider(&args[0], provider));
            let m = coerce_to_number(&eval_expr_with_provider(&args[1], provider));
            let d = coerce_to_number(&eval_expr_with_provider(&args[2], provider));
            match (y, m, d) {
                (Some(y), Some(m), Some(d)) => {
                    Value::Number(date_serial(y as i32, m as u32, d as u32))
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }
        "YEAR" => date_part(args, provider, |y, _, _| y as f64),
        "MONTH" => date_part(args, provider, |_, m, _| m as f64),
        "DAY" => date_part(args, provider, |_, _, d| d as f64),

        // === Dynamic range ===
        // OFFSET(ref, row_offset, col_offset[, height[, width]])
        //
        // When used directly (not as an argument to an aggregate), OFFSET
        // returns the *value* of the top-left cell of the computed range —
        // matching Excel's behaviour when the result is a 1×1 region.
        // When used as a range argument to SUM / COUNT / AVERAGE / VLOOKUP
        // / etc., `for_each_arg_value` and `collect_range_2d_for_arg` detect
        // the OFFSET call and iterate the full computed range instead.
                _ => unreachable!(),
    }
}
