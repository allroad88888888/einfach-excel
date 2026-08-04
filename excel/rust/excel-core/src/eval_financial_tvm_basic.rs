use super::*;

pub(super) fn fn_pmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
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
    match pmt_closed_form(rate, nper, pv, fv, type_) {
        Some(r) if r.is_finite() => Value::Number(r),
        _ => Value::Error(ValueError::Overflow),
    }
}

pub(super) fn fn_pv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[2], provider) {
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
    // Solve `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0` for pv.
    let factor = if rate == 0.0 {
        1.0
    } else {
        (1.0 + rate).powf(nper)
    };
    let comp = annuity_compound(rate, nper);
    if rate == 0.0 {
        let r = -(pmt * nper + fv);
        if r.is_finite() {
            Value::Number(r)
        } else {
            Value::Error(ValueError::Overflow)
        }
    } else {
        if factor == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let r = -(pmt * (1.0 + rate * type_) * comp + fv) / factor;
        if r.is_finite() {
            Value::Number(r)
        } else {
            Value::Error(ValueError::Overflow)
        }
    }
}

pub(super) fn fn_fv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let nper = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pmt = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let pv = if args.len() >= 4 {
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
    // Solve `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0` for fv.
    let factor = if rate == 0.0 {
        1.0
    } else {
        (1.0 + rate).powf(nper)
    };
    let comp = annuity_compound(rate, nper);
    let r = if rate == 0.0 {
        -(pv + pmt * nper)
    } else {
        -(pv * factor + pmt * (1.0 + rate * type_) * comp)
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_nper(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
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
    if rate == 0.0 {
        if pmt == 0.0 {
            return Value::Error(ValueError::DivisionByZero);
        }
        let n = -(pv + fv) / pmt;
        if n.is_finite() {
            return Value::Number(n);
        }
        return Value::Error(ValueError::Overflow);
    }
    // Closed-form: pmt' = pmt*(1+r*type)
    // (1+r)^n = (pmt' - r*fv) / (pmt' + r*pv)
    let pmt_eff = pmt * (1.0 + rate * type_);
    let num = pmt_eff - rate * fv;
    let den = pmt_eff + rate * pv;
    if den == 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let ratio = num / den;
    if !ratio.is_finite() || ratio <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let base = 1.0 + rate;
    if base <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let n = ratio.ln() / base.ln();
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
