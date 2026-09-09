//! Dispatches date basic formula functions.

use super::*;

pub(super) fn eval_fn_date_basic(name: &str, args: &[Expr], provider: &dyn EvalProvider) -> Value {
    match name {
        "TODAY" => {
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
            // 与输入、显示及填充共用 Excel 1900 日期序号。
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut numbers = [0.0; 3];
            for (slot, arg) in numbers.iter_mut().zip(args) {
                let value = eval_expr_with_provider(arg, provider);
                if let Value::Error(error) = value {
                    return Value::Error(error);
                }
                let Some(number) = coerce_to_number(&value) else {
                    return Value::Error(ValueError::InvalidValue);
                };
                *slot = number;
            }
            date_formula_serial(numbers[0], numbers[1], numbers[2])
                .map(Value::Number)
                .unwrap_or(Value::Error(ValueError::Overflow))
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
