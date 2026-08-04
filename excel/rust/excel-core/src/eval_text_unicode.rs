use super::*;

pub(super) fn fn_unichar(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n_f = match coerce_to_number(&v) {
        Some(n) => n.trunc(),
        None => return Value::Error(ValueError::WrongType),
    };
    if !(1.0..=1_114_111.0).contains(&n_f) {
        return Value::Error(ValueError::InvalidValue);
    }
    let cp = n_f as u32;
    // Reject surrogate halves explicitly — char::from_u32 also returns None
    // here, but spelling it out keeps the intent loud.
    if (0xD800..=0xDFFF).contains(&cp) {
        return Value::Error(ValueError::InvalidValue);
    }
    match char::from_u32(cp) {
        Some(c) => Value::Text(c.to_string()),
        None => Value::Error(ValueError::InvalidValue),
    }
}

pub(super) fn fn_unicode(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    match s.chars().next() {
        Some(c) => Value::Number(c as u32 as f64),
        None => Value::Error(ValueError::InvalidValue),
    }
}

pub(super) fn fn_numbervalue(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    // Optional separator args. Take the first character; empty strings
    // fall back to the defaults (Excel parity).
    let decimal_sep = if args.len() >= 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        coerce_to_text(&dv).chars().next().unwrap_or('.')
    } else {
        '.'
    };
    let group_sep = if args.len() == 3 {
        let gv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = gv {
            return Value::Error(e);
        }
        coerce_to_text(&gv).chars().next().unwrap_or(',')
    } else {
        ','
    };
    if decimal_sep == group_sep {
        return Value::Error(ValueError::InvalidValue);
    }
    let raw = coerce_to_text(&text_v);
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        // Excel treats NUMBERVALUE("") as 0. Keep parity.
        return Value::Number(0.0);
    }
    // Strip group separators, then swap decimal → '.'.
    let mut buf = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch == group_sep {
            continue;
        }
        if ch.is_whitespace() {
            continue;
        }
        if ch == decimal_sep {
            buf.push('.');
        } else {
            buf.push(ch);
        }
    }
    // Excel also allows a trailing `%` to scale by 0.01 (repeated `%` stacks).
    let mut pct: i32 = 0;
    while buf.ends_with('%') {
        buf.pop();
        pct += 1;
    }
    match buf.parse::<f64>() {
        Ok(n) => {
            let scale = 100f64.powi(pct);
            if scale == 0.0 {
                Value::Number(n)
            } else {
                Value::Number(n / scale)
            }
        }
        Err(_) => Value::Error(ValueError::InvalidValue),
    }
}
