use super::*;

pub(super) fn macaulay_duration(
    settlement: f64,
    maturity: f64,
    coupon: f64,
    yld: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let (_a, dsc, e) = coup_period_split(settlement, maturity, frequency, basis);
    if !e.is_finite() || e <= 0.0 {
        return Err(ValueError::InvalidValue);
    }
    let dsc_e = dsc / e;
    let n = coup_num(settlement, maturity, frequency);
    let f = frequency as f64;
    let cpn = 100.0 * coupon / f;
    let redemption = 100.0;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    let mut weighted = 0.0_f64;
    let mut pv_total = 0.0_f64;
    let n_int = n as i64;
    for k in 1..=n_int {
        let t_periods = (k as f64) - 1.0 + dsc_e;
        let t_years = t_periods / f;
        let pv = cpn / one_plus.powf(t_periods);
        weighted += t_years * pv;
        pv_total += pv;
    }
    let t_redemp_periods = (n_int as f64) - 1.0 + dsc_e;
    let t_redemp_years = t_redemp_periods / f;
    let pv_redemp = redemption / one_plus.powf(t_redemp_periods);
    weighted += t_redemp_years * pv_redemp;
    pv_total += pv_redemp;
    if pv_total == 0.0 || !pv_total.is_finite() {
        return Err(ValueError::DivisionByZero);
    }
    Ok(weighted / pv_total)
}

pub(super) fn fn_duration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
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
    let coupon = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if coupon < 0.0 || yld < 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    match macaulay_duration(settlement, maturity, coupon, yld, frequency, basis) {
        Ok(d) => Value::Number(d),
        Err(e) => Value::Error(e),
    }
}

pub(super) fn fn_mduration(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 6 {
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
    let coupon = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if coupon < 0.0 || yld < 0.0 || settlement >= maturity {
        return Value::Error(ValueError::Overflow);
    }
    let d = match macaulay_duration(settlement, maturity, coupon, yld, frequency, basis) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };
    let denom = 1.0 + yld / frequency as f64;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number(d / denom)
}
