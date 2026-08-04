use super::*;

pub(super) fn fn_pduration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || pv <= 0.0 || fv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let log_base = (1.0 + rate).ln();
    if log_base == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let result = (fv / pv).ln() / log_base;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_rri(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nper = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if nper <= 0.0 || pv <= 0.0 || fv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let result = (fv / pv).powf(1.0 / nper) - 1.0;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_fvschedule(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let principal = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let mut product = principal;
    let mut err: Option<ValueError> = None;
    for_each_arg_value(&args[1], provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            other => match coerce_to_number(&other) {
                Some(r) => {
                    product *= 1.0 + r;
                }
                None => err = Some(ValueError::WrongType),
            },
        }
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if product.is_finite() {
        Value::Number(product)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

// ---------------------------------------------------------------------------
// R-batch helpers: CJK byte-aware text functions. Each treats CJK +
// full-width characters as 2 bytes (Shift-JIS / DBCS), everything else
// as 1. LEFTB / RIGHTB / MIDB substitute a space when a 2-byte char
// would be split across the byte boundary.
// ---------------------------------------------------------------------------
