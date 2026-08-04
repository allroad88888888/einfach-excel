use super::*;

pub(super) fn oddlprice_from_yield(
    settlement: f64,
    maturity: f64,
    last_interest: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let f = frequency as f64;
    let mut prev_q = last_interest;
    let mut k = 1i32;
    loop {
        let next_q = add_coupon_periods(last_interest, frequency, k);
        if next_q > settlement {
            break;
        }
        prev_q = next_q;
        k += 1;
        if k > 4_000 {
            return Err(ValueError::Overflow);
        }
    }
    let a_periods = yearfrac_basis(prev_q, settlement, basis)? * f;
    let dsm_periods = yearfrac_basis(settlement, maturity, basis)? * f;
    let coupon = 100.0 * rate / f;
    let factor = 1.0 + dsm_periods * yld / f;
    if factor == 0.0 || !factor.is_finite() {
        return Err(ValueError::Overflow);
    }
    let numer = dsm_periods * coupon + redemption;
    let accrued = a_periods * coupon;
    let price = numer / factor - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}

pub(super) fn fn_oddlprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 7 || args.len() > 8 {
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
    let last_interest = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[6], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 7, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || yld < 0.0
        || redemption <= 0.0
        || last_interest >= settlement
        || settlement >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    match oddlprice_from_yield(
        settlement,
        maturity,
        last_interest,
        rate,
        yld,
        redemption,
        frequency,
        basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}

pub(super) fn fn_oddlyield(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 7 || args.len() > 8 {
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
    let last_interest = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pr = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[6], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 7, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || pr <= 0.0
        || redemption <= 0.0
        || last_interest >= settlement
        || settlement >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    // ODDLPRICE has a closed-form in yld; solve directly.
    //   P + A_p*coupon = (DSM_p*coupon + R) / (1 + DSM_p * yld/F)
    //   => yld = F / DSM_p * ((numer / denom) - 1)
    let mut prev_q = last_interest;
    let mut k = 1i32;
    loop {
        let next_q = add_coupon_periods(last_interest, frequency, k);
        if next_q > settlement {
            break;
        }
        prev_q = next_q;
        k += 1;
        if k > 4_000 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let f = frequency as f64;
    let a_periods = match yearfrac_basis(prev_q, settlement, basis) {
        Ok(v) => v * f,
        Err(e) => return Value::Error(e),
    };
    let dsm_periods = match yearfrac_basis(settlement, maturity, basis) {
        Ok(v) => v * f,
        Err(e) => return Value::Error(e),
    };
    if dsm_periods == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let coupon = 100.0 * rate / f;
    let numer = dsm_periods * coupon + redemption;
    let denom = pr + a_periods * coupon;
    if denom == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let y = f / dsm_periods * (numer / denom - 1.0);
    if y.is_finite() {
        Value::Number(y)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
