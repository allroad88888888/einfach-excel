use super::*;

pub(super) const XIRR_TOL: f64 = 1e-7;
pub(super) const XIRR_MAX_ITER: usize = 100;


pub(super) fn collect_xirr_pairs(
    values: &Expr,
    dates: &Expr,
    provider: &dyn EvalProvider,
) -> Result<Vec<(f64, f64)>, ValueError> {
    let mut vs: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value(values, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Number(n) => vs.push(n),
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            _ => err = Some(ValueError::InvalidValue),
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    let mut ds: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value(dates, provider, &mut |_addr, v| {
        if err.is_some() {
            return;
        }
        match v {
            Value::Number(n) => ds.push(n.floor()),
            Value::Error(e) => err = Some(e),
            Value::Null => {}
            _ => err = Some(ValueError::InvalidValue),
        }
    });
    if let Some(e) = err {
        return Err(e);
    }
    if vs.len() != ds.len() || vs.len() < 2 {
        return Err(ValueError::InvalidValue);
    }
    let paired: Vec<(f64, f64)> = ds.into_iter().zip(vs.into_iter()).collect();
    let d0 = paired[0].0;
    if paired.iter().any(|(d, _)| *d < d0) {
        return Err(ValueError::Overflow);
    }
    Ok(paired)
}

pub(super) fn fn_xirr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_xirr_pairs(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    // Require at least one positive AND one negative cash flow.
    let has_pos = pairs.iter().any(|(_, v)| *v > 0.0);
    let has_neg = pairs.iter().any(|(_, v)| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::InvalidValue);
    }
    let guess = if args.len() == 3 {
        match fin_coerce(&args[2], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    if guess <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let d0 = pairs[0].0;
    let mut r = guess;
    for _ in 0..XIRR_MAX_ITER {
        let base = 1.0 + r;
        if base <= 0.0 || !base.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        let mut f = 0.0_f64;
        let mut fp = 0.0_f64;
        for (d, v) in &pairs {
            let t = (*d - d0) / 365.0;
            let denom = base.powf(t);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            f += v / denom;
            // df/dr [v * (1+r)^(-t)] = -t * v * (1+r)^(-t-1)
            fp += -t * v / (denom * base);
        }
        if !f.is_finite() || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if f.abs() < XIRR_TOL {
            return Value::Number(r);
        }
        if fp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < XIRR_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

pub(super) fn fn_xnpv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let pairs = match collect_xirr_pairs(&args[1], &args[2], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    let d0 = pairs[0].0;
    let mut total = 0.0_f64;
    let base = 1.0 + rate;
    if base <= 0.0 || !base.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    for (d, v) in &pairs {
        let t = (*d - d0) / 365.0;
        let denom = base.powf(t);
        if denom == 0.0 || !denom.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        total += v / denom;
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_mirr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let values = match collect_irr_values(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let finance_rate = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let reinvest_rate = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let has_pos = values.iter().any(|v| *v > 0.0);
    let has_neg = values.iter().any(|v| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = values.len() as i32;
    if n < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    if finance_rate <= -1.0 || reinvest_rate <= -1.0 {
        return Value::Error(ValueError::Overflow);
    }
    // PV of negatives at finance_rate (period i counts as i, starting at 0).
    let mut pv_neg = 0.0_f64;
    for (i, v) in values.iter().enumerate() {
        if *v < 0.0 {
            let denom = (1.0 + finance_rate).powi(i as i32);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            pv_neg += v / denom;
        }
    }
    // FV of positives at reinvest_rate at the end (period i grows for n-1-i periods).
    let mut fv_pos = 0.0_f64;
    for (i, v) in values.iter().enumerate() {
        if *v > 0.0 {
            let pow = (1.0 + reinvest_rate).powi((n - 1 - i as i32) as i32);
            if !pow.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            fv_pos += v * pow;
        }
    }
    if pv_neg == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let ratio = -fv_pos / pv_neg;
    if ratio <= 0.0 || !ratio.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let r = ratio.powf(1.0 / (n as f64 - 1.0)) - 1.0;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

// ----- Bond-depth helpers ------------------------------------------------
//
// Coupon-period arithmetic is intentionally simplified: we treat the
// previous-coupon date as `maturity - N*period_days` (largest N keeping
// the result >= settlement). `period_days` is 360/freq for basis 0/2/4,
// 365/freq for basis 3, and `actual` (computed via DATE math subtracting
// months) for basis 1. This is faithful enough for happy-path bond
// scenarios but does not match Excel's exact actual/actual handling for
// odd first/last coupon periods.
