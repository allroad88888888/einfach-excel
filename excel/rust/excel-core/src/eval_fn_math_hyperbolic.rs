//! Dispatches math hyperbolic formula functions.

use super::*;

pub(super) fn eval_fn_math_hyperbolic(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SINH" => unary_number(args, provider, f64::sinh),
        "COSH" => unary_number(args, provider, f64::cosh),
        "TANH" => unary_number(args, provider, f64::tanh),
        "ASINH" => unary_number(args, provider, f64::asinh),
        "ACOSH" => {
            // Domain: n >= 1. Out of domain → #NUM!.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n >= 1.0 => {
                    let r = n.acosh();
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
        "ATANH" => {
            // Domain: |n| < 1. n == ±1 produces ±∞, also Overflow.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n > -1.0 && n < 1.0 => {
                    let r = n.atanh();
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

        // === Reciprocal trig (radians input) ===
        // CSC/SEC/COT each have isolated poles where the underlying
        // sin/cos/tan hits 0. Excel reports `#DIV/0!` at those poles.
        "CSC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = n.sin();
                    if s == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / s;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SEC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let c = n.cos();
                    if c == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / c;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "COT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let t = n.tan();
                    if t == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / t;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }

        // === Reciprocal hyperbolic ===
        // CSCH undefined only at 0; SECH is finite & non-zero
        // everywhere; COTH undefined only at 0 (tanh(0) == 0).
        "CSCH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let s = n.sinh();
                    if s == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / s;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        "SECH" => unary_number(args, provider, |n| 1.0 / n.cosh()),
        "COTH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    let t = n.tanh();
                    if t == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    let r = 1.0 / t;
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }

        // === Inverse reciprocal trig ===
        // ACSC(n) = asin(1/n); n == 0 is #DIV/0!, |n| < 1 is #NUM!.
        // ACSC returns a value in [-PI/2, PI/2] \ {0} — sign follows n
        // (same convention as Excel).
        "ACSC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    if n == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    if n.abs() < 1.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (1.0 / n).asin();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // ASEC(n) = acos(1/n); same domain (|n| >= 1, n != 0).
        // Returns a value in [0, PI].
        "ASEC" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => {
                    if n == 0.0 {
                        return Value::Error(ValueError::DivisionByZero);
                    }
                    if n.abs() < 1.0 {
                        return Value::Error(ValueError::Overflow);
                    }
                    let r = (1.0 / n).acos();
                    if r.is_finite() {
                        Value::Number(r)
                    } else {
                        Value::Error(ValueError::Overflow)
                    }
                }
                None => Value::Error(ValueError::WrongType),
            }
        }
        // ACOT(n) = PI/2 - atan(n); returns a value in (0, PI), matching
        // Excel (which differs from the C/Rust `atan2(1, n)` convention
        // only for n == 0, where Excel chooses +PI/2 rather than the
        // signed-zero branch). Defined for all real n.
        "ACOT" => unary_number(args, provider, |n| std::f64::consts::FRAC_PI_2 - n.atan()),

        // === Math extras ===
        //
        // Pair-of-arrays sums. Same shape contract as CORREL / COVAR
        // (see `collect_paired_numbers`). Pairs are kept only when BOTH
        // cells are `Value::Number`; everything else (Null, Text,
        // Boolean) is skipped, matching Excel's "non-numeric → 0
        // contribution" behaviour for these aggregates.
        "ACOTH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n.abs() > 1.0 => {
                    let r = 0.5 * ((n + 1.0) / (n - 1.0)).ln();
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

        // TRUE() / FALSE() — zero-arg constructors. The parser already
        // emits bare `TRUE` / `FALSE` as `Expr::Bool`, but the
        // function-call form `=TRUE()` routes through here. Any
        // arguments → #VALUE! (Excel surfaces #N/A — we follow our
        // existing convention of WrongArgCount for arity mismatch).
                _ => unreachable!(),
    }
}
