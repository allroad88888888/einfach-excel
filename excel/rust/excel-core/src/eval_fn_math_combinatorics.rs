//! Dispatches math combinatorics formula functions.

use super::*;

pub(super) fn eval_fn_math_combinatorics(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"PRODUCT" => {
            // Variadic: walk every arg via for_each_arg_value so range
            // args stream sparsely. Skip Null/Text/Boolean(false); treat
            // Boolean(true) as 1. Errors propagate. With zero numeric
            // contributors, return 0 to match Excel's "empty product → 0"
            // convention for PRODUCT specifically.
            let mut product = 1.0_f64;
            let mut saw_number = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            product *= n;
                            saw_number = true;
                        }
                        Value::Boolean(true) => {
                            product *= 1.0;
                            saw_number = true;
                        }
                        Value::Null | Value::Text(_) | Value::Boolean(false) => {}
                        // Unreachable: for_each_arg_value flattens Array.
                        Value::Array(_) => {}
                        // Lambda inside PRODUCT is a type error.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_number {
                Value::Number(0.0)
            } else {
                // 连乘比连加更容易顶破 f64 —— 同一条出口闸门。
                finite_or_overflow(product)
            }
        }
        "QUOTIENT" => {
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
                (Some(_), Some(0.0)) => Value::Error(ValueError::DivisionByZero),
                (Some(num), Some(den)) => Value::Number((num / den).trunc()),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "FACT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let trimmed = n.trunc();
                    if trimmed < 0.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    // 170! ≈ 7.26e306, 171! overflows f64.
                    if trimmed > 170.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let k = trimmed as u64;
                    let mut acc = 1.0_f64;
                    for i in 2..=k {
                        acc *= i as f64;
                    }
                    if acc.is_finite() {
                        Value::Number(acc)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "COMBIN" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let nv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = nv {
                return Value::Error(e);
            }
            let kv = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = kv {
                return Value::Error(e);
            }
            match (coerce_to_number(&nv), coerce_to_number(&kv)) {
                (Some(n_raw), Some(k_raw)) => {
                    let n = n_raw.trunc();
                    let k = k_raw.trunc();
                    if n < 0.0 || k < 0.0 || k > n {
                        return Value::Error(ValueError::Overflow);
                    }
                    // Symmetry: C(n,k) = C(n, n-k) — pick the smaller k
                    // to keep the loop short and the product bounded.
                    let n_i = n as u64;
                    let mut k_i = k as u64;
                    if k_i > n_i - k_i {
                        k_i = n_i - k_i;
                    }
                    let mut acc = 1.0_f64;
                    for i in 1..=k_i {
                        acc = acc * (n_i - i + 1) as f64 / i as f64;
                        if !acc.is_finite() {
                            return Value::Error(ValueError::Overflow);
                        }
                    }
                    Value::Number(acc.round())
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "GCD" => {
            // Variadic; require ≥ 1 numeric arg. Coerce to non-negative
            // integer; any negative or non-numeric → WrongType.
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut acc: Option<u64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {} // skip empties from ranges
                        other => match coerce_to_number(&other) {
                            Some(n) if n >= 0.0 && n.is_finite() => {
                                let x = n.trunc() as u64;
                                acc = Some(match acc {
                                    None => x,
                                    Some(a) => gcd_u64(a, x),
                                });
                            }
                            _ => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                match acc {
                    Some(g) => Value::Number(g as f64),
                    None => Value::Error(ValueError::WrongArgCount),
                }
            }
        }
        "LCM" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut acc: Option<u64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_number(&other) {
                            Some(n) if n >= 0.0 && n.is_finite() => {
                                let x = n.trunc() as u64;
                                acc = Some(match acc {
                                    None => x,
                                    Some(a) => {
                                        if a == 0 || x == 0 {
                                            0
                                        } else {
                                            // (a / gcd(a,x)) * x with checked mul.
                                            let g = gcd_u64(a, x);
                                            match (a / g).checked_mul(x) {
                                                Some(l) => l,
                                                None => {
                                                    err = Some(ValueError::Overflow);
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                });
                            }
                            _ => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                match acc {
                    Some(l) => Value::Number(l as f64),
                    None => Value::Error(ValueError::WrongArgCount),
                }
            }
        }
                _ => unreachable!(),
    }
}
