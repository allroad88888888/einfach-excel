use super::*;

pub(super) fn eval_xxx2dec(
    args: &[Expr],
    provider: &dyn EvalProvider,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    // Per Excel: a Boolean / Null isn't a valid binary numeral, even
    // though coerce_to_text would happily emit "TRUE"/"FALSE"/"".
    // Reject those up-front so they don't slip through as InvalidValue
    // from the parser's "non-digit" path (less informative).
    match v {
        Value::Boolean(_) | Value::Null => return Value::Error(ValueError::WrongType),
        _ => {}
    }
    let text = coerce_to_text(&v);
    match parse_base_n_text(&text, base, max_chars, bits_per_digit) {
        Ok(n) => Value::Number(n),
        Err(e) => Value::Error(e),
    }
}

/// Optional-places extractor shared by DEC2XXX and the cross-base
/// wrappers. Returns `Ok(None)` when the arg is absent; `Ok(Some(n))`
/// for a valid 1..=max_chars place count; errors mirror Excel:
///   - non-numeric → WrongType
///   - non-integer / out of 1..=max_chars → InvalidValue
///   - propagated cell error → that error
pub(super) fn engineering_places(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
    max_chars: usize,
) -> Result<Option<usize>, ValueError> {
    let Some(expr) = arg else {
        return Ok(None);
    };
    let v = eval_expr_with_provider(expr, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Err(ValueError::WrongType),
    };
    if !n.is_finite() || n.trunc() != n {
        return Err(ValueError::InvalidValue);
    }
    let p = n as i64;
    if p < 1 || p as usize > max_chars {
        return Err(ValueError::InvalidValue);
    }
    Ok(Some(p as usize))
}

/// Shared body for DEC2BIN / DEC2OCT / DEC2HEX.
pub(super) fn eval_dec2xxx(
    args: &[Expr],
    provider: &dyn EvalProvider,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
    upper_hex: bool,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let places = match engineering_places(args.get(1), provider, max_chars) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    match format_base_n_signed(n, base, max_chars, bits_per_digit, places, upper_hex) {
        Ok(s) => Value::Text(s),
        Err(e) => Value::Error(e),
    }
}

/// Shared body for cross-base wrappers (BIN2HEX, OCT2BIN, ...).
/// `from` = (base, max_chars, bits_per_digit) for the source.
/// `to` = same triple for the destination. `upper_hex` selects the
/// uppercase digit set on the output.
pub(super) fn eval_cross_base(
    args: &[Expr],
    provider: &dyn EvalProvider,
    from: (u32, usize, u32),
    to: (u32, usize, u32),
    upper_hex: bool,
) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    match v {
        Value::Boolean(_) | Value::Null => return Value::Error(ValueError::WrongType),
        _ => {}
    }
    let text = coerce_to_text(&v);
    let dec = match parse_base_n_text(&text, from.0, from.1, from.2) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let places = match engineering_places(args.get(1), provider, to.1) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    match format_base_n_signed(dec, to.0, to.1, to.2, places, upper_hex) {
        Ok(s) => Value::Text(s),
        Err(e) => Value::Error(e),
    }
}
