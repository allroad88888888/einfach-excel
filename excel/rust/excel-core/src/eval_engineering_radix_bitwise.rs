use super::*;

pub(super) fn as_engineering_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        Value::Boolean(true) => Some(1.0),
        Value::Boolean(false) => Some(0.0),
        Value::Null => Some(0.0),
        _ => None,
    }
}

/// Bit-op f64 → u64 domain check. Excel documents BITAND/OR/XOR as
/// accepting 0..=2^48-1; we accept the f64-safe 0..=2^53-1 range so
/// large values produced by other formulas stay representable.
const BIT_OP_MAX: f64 = 9_007_199_254_740_991.0; // 2^53 - 1

pub(super) fn coerce_bit_operand(v: &Value) -> Result<u64, ValueError> {
    let n = match coerce_to_number(v) {
        Some(n) => n,
        None => return Err(ValueError::WrongType),
    };
    if !n.is_finite() || n.trunc() != n {
        return Err(ValueError::Overflow);
    }
    if n < 0.0 || n > BIT_OP_MAX {
        return Err(ValueError::Overflow);
    }
    Ok(n as u64)
}

/// Shared body for BITAND / BITOR / BITXOR.
pub(super) fn eval_bit_binop(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(u64, u64) -> u64,
) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = a {
        return Value::Error(e);
    }
    let b = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = b {
        return Value::Error(e);
    }
    let av = match coerce_bit_operand(&a) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let bv = match coerce_bit_operand(&b) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    Value::Number(f(av, bv) as f64)
}

/// Shared body for BITLSHIFT / BITRSHIFT. `reverse` flips the sign
/// convention: BITLSHIFT(a, -3) == BITRSHIFT(a, 3) and vice versa.
pub(super) fn eval_bit_shift(args: &[Expr], provider: &dyn EvalProvider, reverse: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = a {
        return Value::Error(e);
    }
    let n = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = n {
        return Value::Error(e);
    }
    let av = match coerce_bit_operand(&a) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };
    let nv = match coerce_to_number(&n) {
        Some(x) => x,
        None => return Value::Error(ValueError::WrongType),
    };
    if !nv.is_finite() || nv.trunc() != nv {
        return Value::Error(ValueError::Overflow);
    }
    let shift = nv as i64;
    // Excel's documented shift domain is |n| <= 53.
    if shift.abs() > 53 {
        return Value::Error(ValueError::Overflow);
    }
    // Normalize to "shift left by `effective`": positive → left,
    // negative → right.
    let effective = if reverse { -shift } else { shift };
    let result = if effective == 0 {
        av
    } else if effective > 0 {
        // Left shift: result must still fit in the safe-integer range.
        let r = (av as u128)
            .checked_shl(effective as u32)
            .unwrap_or(u128::MAX);
        if r > BIT_OP_MAX as u128 {
            return Value::Error(ValueError::Overflow);
        }
        r as u64
    } else {
        let amount = (-effective) as u32;
        if amount >= 64 {
            0
        } else {
            av >> amount
        }
    };
    Value::Number(result as f64)
}
