use super::*;

pub(super) fn annuity_compound(rate: f64, n: f64) -> f64 {
    if rate == 0.0 {
        n
    } else {
        ((1.0 + rate).powf(n) - 1.0) / rate
    }
}

/// Coerce one positional argument to a finite number, propagating errors.
/// Returns `Ok(n)` for a successful coercion, `Err(ValueError)` otherwise.
pub(super) fn fin_coerce(arg: &Expr, provider: &dyn EvalProvider) -> Result<f64, ValueError> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    coerce_to_number(&v).ok_or(ValueError::WrongType)
}

/// Coerce a `type` flag (0 or 1) from an optional positional argument.
/// Excel rounds `type` toward zero and accepts 0 or 1; we treat anything
/// else as #VALUE!. Defaults to `0` when the arg is absent.
pub(super) fn fin_coerce_type(
    args: &[Expr],
    idx: usize,
    provider: &dyn EvalProvider,
) -> Result<f64, ValueError> {
    if args.len() <= idx {
        return Ok(0.0);
    }
    let n = fin_coerce(&args[idx], provider)?;
    let t = n.trunc();
    if t != 0.0 && t != 1.0 {
        return Err(ValueError::InvalidValue);
    }
    Ok(t)
}

/// Closed-form PMT solving `pv*(1+r)^n + pmt*(1+r*type)*comp + fv = 0`
/// for `pmt`, where `comp = annuity_compound(rate, n)`. Result is the
/// `pmt` Excel would return (positive `pv` → negative `pmt`).
pub(super) fn pmt_closed_form(rate: f64, n: f64, pv: f64, fv: f64, type_: f64) -> Option<f64> {
    if rate == 0.0 {
        if n == 0.0 {
            return None;
        }
        return Some(-(pv + fv) / n);
    }
    let factor = (1.0 + rate).powf(n);
    let denom = annuity_compound(rate, n) * (1.0 + rate * type_);
    if denom == 0.0 {
        return None;
    }
    Some(-(pv * factor + fv) / denom)
}
