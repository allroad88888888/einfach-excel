//! Dispatches math trigonometry formula functions.

use super::*;

pub(super) fn eval_fn_math_trigonometry(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SIN" => unary_number(args, provider, f64::sin),
        "COS" => unary_number(args, provider, f64::cos),
        "TAN" => unary_number(args, provider, f64::tan),
        "ASIN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if (-1.0..=1.0).contains(&n) => Value::Number(n.asin()),
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ACOS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if (-1.0..=1.0).contains(&n) => Value::Number(n.acos()),
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ATAN" => unary_number(args, provider, f64::atan),
        "ATAN2" => {
            // Note: Excel order is ATAN2(x_num, y_num) — but our spec
            // calls for (y, x) matching libm/JS Math.atan2. Per the task
            // description we follow the (y, x) order.
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let yv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = yv {
                return Value::Error(e);
            }
            let xv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = xv {
                return Value::Error(e);
            }
            match (coerce_to_number(&yv), coerce_to_number(&xv)) {
                (Some(y), Some(x)) => {
                    let r = y.atan2(x);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "RADIANS" => unary_number(args, provider, |d| d * std::f64::consts::PI / 180.0),
        "DEGREES" => unary_number(args, provider, |r| r * 180.0 / std::f64::consts::PI),

        // === Error / type guards (Batch B1) ===
        //
        // IFERROR catches every error. IFNA catches only the dedicated #N/A
        // variant.
                _ => unreachable!(),
    }
}
