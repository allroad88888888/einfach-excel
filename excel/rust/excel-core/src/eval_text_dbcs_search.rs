use super::*;

pub(super) fn fn_findb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let find_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = find_v {
        return Value::Error(e);
    }
    let within_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = within_v {
        return Value::Error(e);
    }
    let start_byte = if args.len() == 3 {
        let s = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = s {
            return Value::Error(e);
        }
        match coerce_to_number(&s) {
            Some(n) if n >= 1.0 => n.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    let needle = coerce_to_text(&find_v);
    let hay = coerce_to_text(&within_v);
    match dbcs_find_byte_index(&needle, &hay, start_byte, false) {
        Ok(p) => Value::Number(p as f64),
        Err(e) => Value::Error(e),
    }
}

pub(super) fn fn_searchb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let find_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = find_v {
        return Value::Error(e);
    }
    let within_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = within_v {
        return Value::Error(e);
    }
    let start_byte = if args.len() == 3 {
        let s = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = s {
            return Value::Error(e);
        }
        match coerce_to_number(&s) {
            Some(n) if n >= 1.0 => n.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    let needle = coerce_to_text(&find_v);
    let hay = coerce_to_text(&within_v);
    match dbcs_find_byte_index(&needle, &hay, start_byte, true) {
        Ok(p) => Value::Number(p as f64),
        Err(e) => Value::Error(e),
    }
}

pub(super) fn fn_replaceb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    let start_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = start_v {
        return Value::Error(e);
    }
    let num_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = num_v {
        return Value::Error(e);
    }
    let new_v = eval_expr_with_provider(&args[3], provider);
    if let Value::Error(e) = new_v {
        return Value::Error(e);
    }
    let start = match coerce_to_number(&start_v) {
        Some(n) if n >= 1.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let num = match coerce_to_number(&num_v) {
        Some(n) if n >= 0.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let text = coerce_to_text(&text_v);
    let new_s = coerce_to_text(&new_v);
    let total = dbcs_byte_len(&text);
    let left = dbcs_take_left(&text, start.saturating_sub(1));
    let consumed_end = start.saturating_sub(1) + num;
    let right = if consumed_end < total {
        dbcs_take_right(&text, total - consumed_end)
    } else {
        String::new()
    };
    let mut out = String::new();
    out.push_str(&left);
    out.push_str(&new_s);
    out.push_str(&right);
    Value::Text(out)
}
