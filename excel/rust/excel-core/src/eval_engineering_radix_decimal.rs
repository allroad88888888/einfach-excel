use super::*;

pub(super) fn fn_decimal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let tv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = tv {
        return Value::Error(e);
    }
    let bv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = bv {
        return Value::Error(e);
    }
    let base_f = match coerce_to_number(&bv) {
        Some(b) => b,
        None => return Value::Error(ValueError::WrongType),
    };
    if !base_f.is_finite() || base_f.trunc() != base_f {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = base_f as i64;
    if !(2..=36).contains(&base) {
        return Value::Error(ValueError::InvalidValue);
    }
    // Accept Text only — numeric inputs would be lossy without us
    // formatting them first; Excel itself coerces Number → string, but
    // we keep the surface strict.
    let text = match &tv {
        Value::Text(s) => s.trim().to_ascii_uppercase(),
        Value::Number(n) => {
            if !n.is_finite() || n.trunc() != *n {
                return Value::Error(ValueError::InvalidValue);
            }
            // Render as plain decimal string; parse below in `base`
            // still applies, matching Excel's coercion path.
            format!("{}", *n as i64)
        }
        _ => return Value::Error(ValueError::WrongType),
    };
    if text.is_empty() {
        return Value::Number(0.0);
    }
    let mut acc: i64 = 0;
    for ch in text.chars() {
        let digit = match ch {
            '0'..='9' => ch as i64 - '0' as i64,
            'A'..='Z' => ch as i64 - 'A' as i64 + 10,
            _ => return Value::Error(ValueError::InvalidValue),
        };
        if digit >= base {
            return Value::Error(ValueError::InvalidValue);
        }
        acc = match acc.checked_mul(base).and_then(|a| a.checked_add(digit)) {
            Some(v) => v,
            None => return Value::Error(ValueError::Overflow),
        };
    }
    Value::Number(acc as f64)
}

/// BASE(num, base[, min_length]) — render a non-negative integer in
/// `base` (2..=36), zero-padded to `min_length` if requested.
pub(super) fn fn_base(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if !(2..=3).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n_raw = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    if !n_raw.is_finite() || n_raw < 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let n = n_raw.trunc() as i64;
    let bv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = bv {
        return Value::Error(e);
    }
    let base_f = match coerce_to_number(&bv) {
        Some(b) => b,
        None => return Value::Error(ValueError::WrongType),
    };
    if !base_f.is_finite() || base_f.trunc() != base_f {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = base_f as i64;
    if !(2..=36).contains(&base) {
        return Value::Error(ValueError::InvalidValue);
    }
    let min_len: usize = if args.len() == 3 {
        let mv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = mv {
            return Value::Error(e);
        }
        match coerce_to_number(&mv) {
            Some(m) if m.is_finite() && m >= 0.0 => m.trunc() as usize,
            Some(_) => return Value::Error(ValueError::InvalidValue),
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    let s = if n == 0 {
        "0".to_string()
    } else {
        let mut digits: Vec<char> = Vec::new();
        let mut rem = n;
        while rem > 0 {
            let d = (rem % base) as u32;
            let ch = if d < 10 {
                (b'0' + d as u8) as char
            } else {
                (b'A' + (d - 10) as u8) as char
            };
            digits.push(ch);
            rem /= base;
        }
        digits.iter().rev().collect::<String>()
    };
    if s.len() >= min_len {
        Value::Text(s)
    } else {
        let pad = min_len - s.len();
        Value::Text(format!("{}{}", "0".repeat(pad), s))
    }
}
