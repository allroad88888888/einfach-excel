use super::*;

pub(super) fn fn_price(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
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
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0 || yld < 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    match price_from_yield(
        settlement, maturity, rate, yld, redemption, frequency, basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}

pub(super) fn fn_yield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
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
    let rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[5], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0 || pr <= 0.0 || redemption <= 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    // Newton-Raphson on PRICE(yield) - pr.
    let mut y = rate.max(0.05);
    for _ in 0..100 {
        let p = match price_from_yield(settlement, maturity, rate, y, redemption, frequency, basis)
        {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let dy = 1e-6_f64;
        let p2 = match price_from_yield(
            settlement,
            maturity,
            rate,
            y + dy,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let f = p - pr;
        if f.abs() < 1e-7 {
            return Value::Number(y);
        }
        let fp = (p2 - p) / dy;
        if fp == 0.0 || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let next = y - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - y).abs() < 1e-9 {
            return Value::Number(next);
        }
        y = next;
    }
    Value::Error(ValueError::Overflow)
}
