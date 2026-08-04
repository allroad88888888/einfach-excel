use super::*;

pub(super) fn fn_oddfyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 8 || args.len() > 9 {
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
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_coupon = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[6], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[7], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 8, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || pr <= 0.0
        || redemption <= 0.0
        || issue >= settlement
        || settlement >= first_coupon
        || first_coupon >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    let mut y = rate.max(0.05);
    for _ in 0..100 {
        let p = match oddfprice_from_yield(
            settlement,
            maturity,
            issue,
            first_coupon,
            rate,
            y,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let dy = 1e-6_f64;
        let p2 = match oddfprice_from_yield(
            settlement,
            maturity,
            issue,
            first_coupon,
            rate,
            y + dy,
            redemption,
            frequency,
            basis,
        ) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        };
        let diff = p - pr;
        if diff.abs() < 1e-7 {
            return Value::Number(y);
        }
        let fp = (p2 - p) / dy;
        if fp == 0.0 || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let next = y - diff / fp;
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
