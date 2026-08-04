use super::*;

pub(super) fn fn_received(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
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
    let investment = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let discount = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if investment <= 0.0 || discount <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let yf = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 - discount * yf;
    if denom <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = investment / denom;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_tbilleq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
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
    let discount = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if discount <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    let denom = 360.0 - discount * diff;
    if denom <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(365.0 * discount / denom)
}

pub(super) fn fn_tbillprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
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
    let discount = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if discount <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(100.0 * (1.0 - discount * diff / 360.0))
}

pub(super) fn fn_tbillyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
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
    let pr = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if pr <= 0.0 || maturity <= settlement {
        return Value::Error(ValueError::Overflow);
    }
    let diff = day_diff(settlement, maturity);
    if diff <= 0.0 || diff > 365.0 {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number((100.0 - pr) / pr * 360.0 / diff)
}
