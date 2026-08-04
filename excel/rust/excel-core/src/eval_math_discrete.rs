use super::*;

pub(super) fn fn_even(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n == 0.0 {
        return Value::Number(0.0);
    }
    let sign = if n < 0.0 { -1.0 } else { 1.0 };
    let absn = n.abs();
    let mut rounded = absn.ceil();
    if (rounded as i64) % 2 != 0 {
        rounded += 1.0;
    }
    Value::Number(sign * rounded)
}

/// FACTDOUBLE(n) — double factorial: n · (n-2) · (n-4) · … down to 2 or 1.
pub(super) fn fn_factdouble(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n < 0 {
        return Value::Error(ValueError::Overflow);
    }
    if n == 0 || n == 1 {
        return Value::Number(1.0);
    }
    if n > 300 {
        return Value::Error(ValueError::Overflow);
    }
    let mut acc = 1.0_f64;
    let mut k = n;
    while k >= 2 {
        acc *= k as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        k -= 2;
    }
    Value::Number(acc)
}

/// COMBINA(n, k) — combinations with repetition = C(n + k - 1, k).
pub(super) fn fn_combina(args: &[Expr], provider: &dyn EvalProvider) -> Value {
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
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    let k = match coerce_to_number(&kv) {
        Some(x) if x.is_finite() => x.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n < 0 || k < 0 {
        return Value::Error(ValueError::Overflow);
    }
    if n == 0 && k == 0 {
        return Value::Number(1.0);
    }
    let top = (n + k - 1) as u64;
    let mut pick = k as u64;
    if top.saturating_sub(pick) < pick {
        pick = top - pick;
    }
    let mut acc = 1.0_f64;
    for i in 1..=pick {
        acc = acc * (top - i + 1) as f64 / i as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
    }
    Value::Number(acc.round())
}

/// MULTINOMIAL(n1, n2, …).
pub(super) fn fn_multinomial(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    let mut nums: Vec<u64> = Vec::new();
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
                    Some(n) if n.is_finite() && n.trunc() >= 0.0 => {
                        nums.push(n.trunc() as u64);
                    }
                    _ => err = Some(ValueError::WrongType),
                },
            }
        });
    }
    if let Some(e) = err {
        return Value::Error(e);
    }
    if nums.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    let total: u64 = nums.iter().sum();
    let fact = |k: u64| -> Option<f64> {
        if k > 170 {
            return None;
        }
        let mut acc = 1.0_f64;
        for i in 2..=k {
            acc *= i as f64;
            if !acc.is_finite() {
                return None;
            }
        }
        Some(acc)
    };
    let num = match fact(total) {
        Some(x) => x,
        None => return Value::Error(ValueError::Overflow),
    };
    let mut den = 1.0_f64;
    for n in &nums {
        let f = match fact(*n) {
            Some(x) => x,
            None => return Value::Error(ValueError::Overflow),
        };
        den *= f;
        if !den.is_finite() || den == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let r = num / den;
    if !r.is_finite() {
        Value::Error(ValueError::Overflow)
    } else {
        Value::Number(r.round())
    }
}
