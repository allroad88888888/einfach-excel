use super::*;

/// Trivial EvalProvider used inside CUMIPMT/CUMPRINC's IPMT/PPMT recursion
/// where all args are already literals (no cell lookups needed).
pub(super) struct CumNoopProvider;
impl EvalProvider for CumNoopProvider {
    fn cell(&self, _addr: CellAddress) -> Value {
        Value::Null
    }
    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Null
    }
}

pub(super) fn cumulative_pmt<F>(args: &[Expr], provider: &dyn EvalProvider, per_call: F) -> Value
where
    F: Fn(f64, f64, f64, f64, f64) -> Value,
{
    if args.len() != 6 {
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
    let start = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let type_ = match fin_coerce_type(args, 5, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate <= 0.0 || nper <= 0.0 || pv <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let s = start.trunc() as i64;
    let e = end.trunc() as i64;
    let n = nper.trunc() as i64;
    if s < 1 || e < s || e > n {
        return Value::Error(ValueError::Overflow);
    }
    let mut total = 0.0_f64;
    for k in s..=e {
        match per_call(rate, k as f64, nper, pv, type_) {
            Value::Number(v) => total += v,
            other => return other,
        }
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_cumipmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    cumulative_pmt(args, provider, |rate, per, nper, pv, type_| {
        // Build the args IPMT expects: (rate, per, nper, pv, fv=0, type).
        let synth = [
            Expr::Number(rate),
            Expr::Number(per),
            Expr::Number(nper),
            Expr::Number(pv),
            Expr::Number(0.0),
            Expr::Number(type_),
        ];
        fn_ipmt(&synth, &CumNoopProvider)
    })
}

pub(super) fn fn_cumprinc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    cumulative_pmt(args, provider, |rate, per, nper, pv, type_| {
        let synth = [
            Expr::Number(rate),
            Expr::Number(per),
            Expr::Number(nper),
            Expr::Number(pv),
            Expr::Number(0.0),
            Expr::Number(type_),
        ];
        fn_ppmt(&synth, &CumNoopProvider)
    })
}

pub(super) fn fn_effect(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nominal = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let npery = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let n = npery.trunc();
    if nominal <= 0.0 || n < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = (1.0 + nominal / n).powf(n) - 1.0;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_nominal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let effect = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let npery = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let n = npery.trunc();
    if effect <= 0.0 || n < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let r = ((1.0 + effect).powf(1.0 / n) - 1.0) * n;
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_ispmt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
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
    if nper == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Excel sign convention: a positive `pv` (loan we receive) implies
    // negative interest (outflow), and ISPMT pays straight-line interest.
    Value::Number(-pv * rate * (1.0 - per / nper))
}
