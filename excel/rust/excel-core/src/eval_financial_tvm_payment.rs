use super::*;

pub(super) fn fn_rate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nper = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 4 {
        match fin_coerce(&args[3], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 4, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let guess = if args.len() == 6 {
        match fin_coerce(&args[5], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    if nper <= 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut r = guess;
    for _ in 0..RATE_MAX_ITER {
        let (g, gp) = rate_residual(r, nper, pmt, pv, fv, type_);
        if !g.is_finite() || !gp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if g.abs() < RATE_TOL {
            return Value::Number(r);
        }
        if gp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - g / gp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < RATE_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

pub(super) fn fn_ipmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let per = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if per < 1.0 || per > nper {
        return Value::Error(ValueError::InvalidValue);
    }
    let pmt = match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(v) => v,
        None => return Value::Error(ValueError::Overflow),
    };
    // For type=1 and per=1: interest is paid up-front, so ipmt = 0.
    if type_ == 1.0 && per == 1.0 {
        return Value::Number(0.0);
    }
    // For type=1 we shift the effective period: balance at the start of
    // period `per` (after `per-1` payments have been applied) uses
    // (per-2) compounding because the period-1 payment happened at t=0.
    let k = if type_ == 1.0 { per - 2.0 } else { per - 1.0 };
    if rate == 0.0 {
        // Linear: every payment is purely principal; interest is 0 for
        // any period when rate=0.
        return Value::Number(0.0);
    }
    let pow_k = (1.0 + rate).powf(k);
    let balance = pv * pow_k + pmt * annuity_compound(rate, k);
    let ipmt = -balance * rate;
    if ipmt.is_finite() {
        Value::Number(ipmt)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_ppmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // Reuse IPMT and PMT. We need the same args order for PMT
    // (rate, nper, pv, fv, type) but IPMT takes (rate, per, nper, pv, fv, type).
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // We don't directly use `per` here but the IPMT path will validate it.
    let _per = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let fv = if args.len() >= 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.0
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(v) => v,
        None => return Value::Error(ValueError::Overflow),
    };
    let ipmt = match fn_ipmt(args, provider) {
        Value::Number(n) => n,
        other => return other,
    };
    let ppmt = pmt - ipmt;
    if ppmt.is_finite() {
        Value::Number(ppmt)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
