use super::*;

pub(super) fn fn_npv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let rate = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if rate == -1.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Walk every following arg, accumulating discount-factor * value.
    // For range cells we skip non-numeric values (Excel parity for NPV
    // ranges, which legitimately contain blanks or labels). Non-numeric
    // *scalar* args would surface as #VALUE! in real Excel; we apply the
    // same range-skip behavior uniformly for simplicity — documented at
    // the function's match arm.
    let mut total = 0.0_f64;
    let mut i: u32 = 1;
    let mut err: Option<ValueError> = None;
    for arg in &args[1..] {
        if err.is_some() {
            break;
        }
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => {
                    err = Some(e);
                }
                Value::Number(n) => {
                    let denom = (1.0 + rate).powi(i as i32);
                    if denom == 0.0 || !denom.is_finite() {
                        err = Some(ValueError::Overflow);
                        return;
                    }
                    total += n / denom;
                    i += 1;
                }
                _ => {
                    // Range blanks / labels are skipped (Excel parity).
                    // For scalar args this matches typical behavior of
                    // ignoring booleans/text in financial aggregates.
                }
            }
        });
    }
    if let Some(e) = err {
        return Value::Error(e);
    }
    if !total.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(total)
}

/// Collect cash flows from an IRR argument. The argument must be a range
/// (single-cell or multi-cell). Returns the values in row-major order;
/// non-numeric cells produce `Err(InvalidValue)` so the caller bails with
/// `#VALUE!`. Empty range → `Err(InvalidValue)`.
pub(super) fn collect_irr_values(arg: &Expr, provider: &dyn EvalProvider) -> Result<Vec<f64>, ValueError> {
    let grid = match collect_range_2d_for_arg(arg, provider) {
        Some(g) => g,
        None => return Err(ValueError::WrongType),
    };
    let mut out: Vec<f64> = Vec::new();
    for row in &grid {
        for cell in row {
            match cell {
                Value::Number(n) => out.push(*n),
                Value::Error(e) => return Err(e.clone()),
                Value::Null => {} // skip blanks
                _ => return Err(ValueError::InvalidValue),
            }
        }
    }
    if out.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    Ok(out)
}

const IRR_TOL: f64 = 1e-7;
const IRR_MAX_ITER: usize = 100;

/// IRR — Newton-Raphson on f(r) = Σ value_i / (1+r)^i for i = 0..n-1.
pub(super) fn fn_irr(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let values = match collect_irr_values(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Require at least one positive AND one negative cash flow.
    let has_pos = values.iter().any(|v| *v > 0.0);
    let has_neg = values.iter().any(|v| *v < 0.0);
    if !(has_pos && has_neg) {
        return Value::Error(ValueError::InvalidValue);
    }
    let guess = if args.len() == 2 {
        match fin_coerce(&args[1], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        0.1
    };
    let mut r = guess;
    for _ in 0..IRR_MAX_ITER {
        // f(r) and f'(r) in a single pass.
        let mut f = 0.0_f64;
        let mut fp = 0.0_f64;
        let base = 1.0 + r;
        if base == 0.0 || !base.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        for (i, v) in values.iter().enumerate() {
            let denom = base.powi(i as i32);
            if denom == 0.0 || !denom.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            f += v / denom;
            if i > 0 {
                fp += -(i as f64) * v / (denom * base);
            }
        }
        if !f.is_finite() || !fp.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if f.abs() < IRR_TOL {
            return Value::Number(r);
        }
        if fp == 0.0 {
            return Value::Error(ValueError::Overflow);
        }
        let next = r - f / fp;
        if !next.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        if (next - r).abs() < IRR_TOL {
            return Value::Number(next);
        }
        r = next;
    }
    Value::Error(ValueError::Overflow)
}

pub(super) const RATE_TOL: f64 = 1e-7;
pub(super) const RATE_MAX_ITER: usize = 100;

/// Evaluate the annuity equation `g(r) = pv*(1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r + fv`
/// and its derivative wrt `r`.
pub(super) fn rate_residual(rate: f64, n: f64, pmt: f64, pv: f64, fv: f64, type_: f64) -> (f64, f64) {
    if rate == 0.0 {
        // g(0) = pv + pmt*n + fv ; g'(0) handled via series expansion:
        // d/dr [(1+r)^n] |0 = n
        // d/dr [(1+r*type)*((1+r)^n - 1)/r] |0 = n*(n-1)/2 + type*n
        let g = pv + pmt * n + fv;
        let gp = pv * n + pmt * (n * (n - 1.0) / 2.0 + type_ * n);
        return (g, gp);
    }
    let one_plus_r = 1.0 + rate;
    let power = one_plus_r.powf(n);
    let comp = (power - 1.0) / rate;
    let g = pv * power + pmt * (1.0 + rate * type_) * comp + fv;
    // d/dr [(1+r)^n] = n*(1+r)^(n-1)
    let dpower = n * one_plus_r.powf(n - 1.0);
    // d/dr [comp] = d/dr [((1+r)^n - 1)/r] = (n*(1+r)^(n-1) * r - ((1+r)^n - 1)) / r^2
    let dcomp = (dpower * rate - (power - 1.0)) / (rate * rate);
    // d/dr [pmt*(1+r*type)*comp] = pmt*(type*comp + (1+r*type)*dcomp)
    let gp = pv * dpower + pmt * (type_ * comp + (1.0 + rate * type_) * dcomp);
    (g, gp)
}
