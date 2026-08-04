//! Dispatches math rounding formula functions.

use super::*;

pub(super) fn eval_fn_math_rounding(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"INT" => unary_number(args, provider, f64::floor),
        // TRUNC(n[, digits]) truncates toward zero. Default digits = 0.
        // Negative digits truncate to the left of the decimal point
        // (e.g. TRUNC(123.45, -1) = 120).
        "TRUNC" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let digits = if args.len() == 2 {
                let dv = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = dv {
                    return Value::Error(e);
                }
                match coerce_to_number(&dv) {
                    Some(d) => d.trunc() as i32,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0
            };
            match coerce_to_number(&nv) {
                Some(n) => {
                    let factor = 10f64.powi(digits);
                    let r = (n * factor).trunc() / factor;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SIGN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = if n > 0.0 {
                        1.0
                    } else if n < 0.0 {
                        -1.0
                    } else {
                        0.0
                    };
                    Value::Number(s)
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "EXP" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let r = n.exp();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > 0.0 => {
                    let r = n.ln();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LOG" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let base = if args.len() == 2 {
                let bv = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = bv {
                    return Value::Error(e);
                }
                match coerce_to_number(&bv) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                10.0
            };
            match coerce_to_number(&nv) {
                Some(n) if n > 0.0 && base > 0.0 && base != 1.0 => {
                    let r = n.log(base);
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "LOG10" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > 0.0 => {
                    let r = n.log10();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                Some(_) => Value::Error(ValueError::Overflow),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "PI" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Number(std::f64::consts::PI)
        }
        "ROUNDUP" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let dv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = dv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&dv)) {
                (Some(n), Some(d)) => {
                    let factor = 10f64.powi(d.trunc() as i32);
                    let sign = if n < 0.0 { -1.0 } else { 1.0 };
                    let r = (n.abs() * factor).ceil() / factor * sign;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "ROUNDDOWN" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let dv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = dv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&dv)) {
                (Some(n), Some(d)) => {
                    let factor = 10f64.powi(d.trunc() as i32);
                    let sign = if n < 0.0 { -1.0 } else { 1.0 };
                    let r = (n.abs() * factor).floor() / factor * sign;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "MROUND" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let mv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = mv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&mv)) {
                (Some(_), Some(0.0)) => Value::Number(0.0),
                (Some(n), Some(m)) => {
                    // Excel: sign(n) must match sign(multiple) for both
                    // non-zero, otherwise #NUM!.
                    if n != 0.0 && ((n > 0.0) != (m > 0.0)) {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (n / m).round() * m;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
                _ => unreachable!(),
    }
}
