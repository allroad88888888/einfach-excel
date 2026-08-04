use super::*;

pub(super) fn fn_dollarde(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let frac_dollar = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fraction = match fin_coerce(&args[1], provider) {
        Ok(v) => v.trunc(),
        Err(e) => return Value::Error(e),
    };
    if fraction < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if fraction < 1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sign = if frac_dollar < 0.0 { -1.0 } else { 1.0 };
    let abs_dollar = frac_dollar.abs();
    let int_part = abs_dollar.trunc();
    let frac_part = abs_dollar - int_part;
    let scale = 10.0_f64.powf((fraction).log10().ceil());
    let decimal = int_part + frac_part * scale / fraction;
    let result = sign * decimal;
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_dollarfr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let dec_dollar = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fraction = match fin_coerce(&args[1], provider) {
        Ok(v) => v.trunc(),
        Err(e) => return Value::Error(e),
    };
    if fraction < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if fraction < 1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sign = if dec_dollar < 0.0 { -1.0 } else { 1.0 };
    let abs_dollar = dec_dollar.abs();
    let int_part = abs_dollar.trunc();
    let dec_part = abs_dollar - int_part;
    let scale = 10.0_f64.powf((fraction).log10().ceil());
    let frac_part = dec_part * fraction / scale;
    let result = sign * (int_part + frac_part);
    if result.is_finite() {
        Value::Number(result)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_coupdaybs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    // basis is validated for range parity with Excel but doesn't change
    // the simple settlement - prev_coupon day count we surface.
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let pcd = prev_coupon_date(settlement, maturity, frequency);
    Value::Number(day_diff(pcd, settlement).max(0.0))
}

pub(super) fn fn_coupdays(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    // For basis 1 (actual/actual) we return the real day count between
    // prev and next coupon dates. For other bases we return the canonical
    // 360/freq or 365/freq number that yearfrac_basis uses.
    let days = if basis == 1 {
        let pcd = prev_coupon_date(settlement, maturity, frequency);
        let ncd = next_coupon_date(settlement, maturity, frequency);
        day_diff(pcd, ncd)
    } else {
        coup_period_days(frequency, basis)
    };
    Value::Number(days)
}

pub(super) fn fn_coupnum(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[2], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let _basis = match fin_basis(args, 3, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(coup_num(settlement, maturity, frequency))
}
