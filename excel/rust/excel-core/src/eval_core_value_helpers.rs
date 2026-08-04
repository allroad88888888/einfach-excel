use super::*;

pub(super) fn coerce_to_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Boolean(b) => Some(*b),
        Value::Number(n) => Some(*n != 0.0),
        _ => None,
    }
}

pub(super) fn unary_number(args: &[Expr], provider: &dyn EvalProvider, f: impl Fn(f64) -> f64) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    match coerce_to_number(&v) {
        Some(n) => {
            let r = f(n);
            if r.is_finite() {
                Value::Number(r)
            } else {
                Value::Error(ValueError::Overflow)
            }
        }
        None => Value::Error(ValueError::WrongType),
    }
}

pub(super) fn text_unary(args: &[Expr], provider: &dyn EvalProvider, f: impl Fn(&str) -> String) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    Value::Text(f(&coerce_to_text(&v)))
}

pub(super) fn text_slice(
    args: &[Expr],
    provider: &dyn EvalProvider,
    take: impl Fn(&str, usize) -> String,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let s = coerce_to_text(&eval_expr_with_provider(&args[0], provider));
    let n = if args.len() == 2 {
        match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
            Some(n) if n >= 0.0 => n as usize,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        1
    };
    Value::Text(take(&s, n))
}

pub(super) fn format_with_text_pattern(value: f64, pattern: &str) -> Option<String> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return None;
    }

    if pattern == "0.00" {
        return Some(format!("{:.2}", value));
    }

    if pattern.chars().all(|c| c == '0') {
        let width = pattern.len();
        let rounded = format!("{:.0}", value);
        let (sign, digits) = rounded
            .strip_prefix('-')
            .map_or(("", rounded.as_str()), |digits| ("-", digits));
        return Some(format!("{sign}{}", format!("{:0>width$}", digits)));
    }

    if pattern.contains('.') {
        let (left, right) = pattern.split_once('.')?;
        if left.is_empty()
            || right.is_empty()
            || !left.chars().all(|c| c == '0')
            || !right.chars().all(|c| c == '0')
        {
            return None;
        }
        let decimals = right.len();
        return Some(format!("{:.*}", decimals, value));
    }

    None
}
