use super::*;

pub(super) fn fn_roman(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
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
    // Truncate toward zero, then range-check.
    let n = n_raw.trunc() as i64;
    if !(1..=3999).contains(&n) {
        return Value::Error(ValueError::InvalidValue);
    }
    if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        let form = match fv {
            Value::Boolean(true) => 0,
            Value::Boolean(false) => 4,
            other => match coerce_to_number(&other) {
                Some(f) => f.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            },
        };
        if !(0..=4).contains(&form) {
            return Value::Error(ValueError::InvalidValue);
        }
        return roman_with_form(n, form as usize);
    }
    roman_with_form(n, 0)
}

pub(super) fn roman_with_form(n: i64, form: usize) -> Value {
    let mut rem = n;
    let mut out = String::new();
    for (v, sym) in ROMAN_FORMS[form].iter() {
        while rem >= *v {
            out.push_str(sym);
            rem -= *v;
        }
    }
    Value::Text(out)
}

pub(super) fn fn_arabic(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let raw = match &v {
        Value::Text(s) => s.clone(),
        Value::Null => String::new(),
        // Numbers/booleans → reject.
        _ => return Value::Error(ValueError::WrongType),
    };
    let s = raw.trim().to_ascii_uppercase();
    if s.is_empty() {
        return Value::Number(0.0);
    }
    let mut total: i64 = 0;
    let mut prev: i64 = 0;
    for ch in s.chars().rev() {
        let v = match ch {
            'I' => 1,
            'V' => 5,
            'X' => 10,
            'L' => 50,
            'C' => 100,
            'D' => 500,
            'M' => 1000,
            _ => return Value::Error(ValueError::InvalidValue),
        };
        if v < prev {
            total -= v;
        } else {
            total += v;
        }
        prev = v;
    }
    Value::Number(total as f64)
}
