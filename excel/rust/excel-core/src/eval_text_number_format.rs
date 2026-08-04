use super::*;

pub(super) fn format_thousands(value: f64, decimals: i64, use_commas: bool) -> String {
    let abs = value.abs();
    if decimals < 0 {
        let factor = 10f64.powi((-decimals) as i32);
        let rounded = (abs / factor).round() * factor;
        let whole = rounded as u64;
        let whole_s = whole.to_string();
        if use_commas {
            return insert_commas(&whole_s);
        }
        return whole_s;
    }
    let dec = decimals.min(15) as usize;
    let formatted = format!("{:.*}", dec, abs);
    let (whole, frac) = match formatted.find('.') {
        Some(i) => (&formatted[..i], Some(&formatted[i + 1..])),
        None => (formatted.as_str(), None),
    };
    let whole_out = if use_commas {
        insert_commas(whole)
    } else {
        whole.to_string()
    };
    match frac {
        Some(f) if !f.is_empty() => format!("{}.{}", whole_out, f),
        _ => whole_out,
    }
}

pub(super) fn insert_commas(digits: &str) -> String {
    let bytes = digits.as_bytes();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    let len = bytes.len();
    for (i, &b) in bytes.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            out.push(',');
        }
        out.push(b as char);
    }
    out
}

/// DOLLAR(number, [decimals=2]).
pub(super) fn fn_dollar(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x,
        _ => return Value::Error(ValueError::WrongType),
    };
    let decimals: i64 = if args.len() == 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        match coerce_to_number(&dv) {
            Some(x) if x.is_finite() => x.trunc() as i64,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        2
    };
    let body = format_thousands(n, decimals, true);
    let result = if n < 0.0 {
        format!("(${})", body)
    } else {
        format!("${}", body)
    };
    Value::Text(result)
}

/// FIXED(number, [decimals=2], [no_commas=FALSE]).
pub(super) fn fn_fixed(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(x) if x.is_finite() => x,
        _ => return Value::Error(ValueError::WrongType),
    };
    let decimals: i64 = if args.len() >= 2 {
        let dv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = dv {
            return Value::Error(e);
        }
        match coerce_to_number(&dv) {
            Some(x) if x.is_finite() => x.trunc() as i64,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        2
    };
    let no_commas: bool = if args.len() == 3 {
        let bv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = bv {
            return Value::Error(e);
        }
        coerce_to_bool(&bv).unwrap_or(false)
    } else {
        false
    };
    let body = format_thousands(n, decimals, !no_commas);
    let result = if n < 0.0 { format!("-{}", body) } else { body };
    Value::Text(result)
}
