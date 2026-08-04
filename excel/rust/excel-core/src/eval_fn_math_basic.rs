//! Dispatches math basic formula functions.

use super::*;

pub(super) fn eval_fn_math_basic(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"ABS" => unary_number(args, provider, |n| n.abs()),
        "SQRT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n < 0.0 => Value::Error(ValueError::Overflow),
                Some(n) => Value::Number(n.sqrt()),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ROUND" => {
            // ROUND(value, digits)
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            let d = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&n), coerce_to_number(&d)) {
                (Some(value), Some(digits)) => {
                    let factor = 10f64.powi(digits as i32);
                    Value::Number((value * factor).round() / factor)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "CEILING" => unary_number(args, provider, f64::ceil),
        "FLOOR" => unary_number(args, provider, f64::floor),
        "POWER" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let b = eval_expr_with_provider(&args[0], provider);
            let e = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&b), coerce_to_number(&e)) {
                (Some(base), Some(exp)) => {
                    let r = base.powf(exp);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "MOD" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            let b = eval_expr_with_provider(&args[1], provider);
            match (coerce_to_number(&a), coerce_to_number(&b)) {
                (Some(_), Some(0.0)) => Value::Error(ValueError::DivisionByZero),
                (Some(va), Some(vb)) => Value::Number(va.rem_euclid(vb)),
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // === Text ===
                _ => unreachable!(),
    }
}
