use super::*;

pub(super) fn fn_text_before_after(args: &[Expr], provider: &dyn EvalProvider, before: bool) -> Value {
    if args.len() < 2 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &text_v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&text_v);

    let delim_v = eval_expr_with_provider(&args[1], provider);
    let delims = match collect_textsplit_delims(&delim_v, true) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };

    let instance: i64 = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    if instance == 0 {
        return Value::Error(ValueError::InvalidValue);
    }

    let match_mode: i64 = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_mode, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    let match_end: i64 = if args.len() >= 5 {
        let v = eval_expr_with_provider(&args[4], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_end, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    let not_found_arg = args.get(5);
    let not_found = || {
        eval_optional_value_arg(
            not_found_arg,
            provider,
            Value::Error(ValueError::NotAvailable),
        )
    };

    if delims.iter().any(|d| d.is_empty()) {
        return match instance {
            1 => Value::Text(if before { String::new() } else { text.clone() }),
            -1 => Value::Text(if before { text.clone() } else { String::new() }),
            _ => not_found(),
        };
    }

    // Enumerate every match position as (start, end). With `match_end`,
    // Excel treats only the end of the string as an implicit match.
    let mut matches: Vec<(usize, usize)> = Vec::new();
    let mut pos = 0usize;
    while let Some((s, e, _)) = find_first_textsplit_delim(&text, &delims, pos, match_mode) {
        matches.push((s, e));
        if e == s {
            // Empty delim guarded above, but defensive: avoid infinite loop.
            pos = s + 1;
        } else {
            pos = e;
        }
        if pos > text.len() {
            break;
        }
    }
    if match_end == 1 {
        matches.push((text.len(), text.len()));
    }

    // Resolve the requested instance.
    let pick: Option<(usize, usize)> = if instance > 0 {
        let i = instance as usize;
        if i == 0 || i > matches.len() {
            None
        } else {
            Some(matches[i - 1])
        }
    } else {
        let i = (-instance) as usize;
        if i == 0 || i > matches.len() {
            None
        } else {
            Some(matches[matches.len() - i])
        }
    };

    match pick {
        Some((s, e)) => {
            if before {
                Value::Text(text[..s].to_string())
            } else {
                Value::Text(text[e..].to_string())
            }
        }
        None => not_found(),
    }
}
