use super::*;

pub(super) fn rank_eq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let value = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let order_desc = if args.len() == 3 {
        let ov = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = ov {
            return Value::Error(e);
        }
        match coerce_to_number(&ov) {
            Some(n) => n == 0.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        true
    };
    let nums = collect_numbers(&args[1..2], provider);
    if !nums.iter().any(|x| *x == value) {
        return Value::Error(ValueError::InvalidValue);
    }
    let rank = if order_desc {
        1 + nums.iter().filter(|x| **x > value).count()
    } else {
        1 + nums.iter().filter(|x| **x < value).count()
    };
    Value::Number(rank as f64)
}

/// Shared implementation for RANKAVG (Excel's RANK.AVG). Tied values get the
/// average of the ranks they would occupy (e.g. 3 tied at base rank 5 → 6.0).
pub(super) fn rank_avg(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let value = match coerce_to_number(&v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let order_desc = if args.len() == 3 {
        let ov = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = ov {
            return Value::Error(e);
        }
        match coerce_to_number(&ov) {
            Some(n) => n == 0.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        true
    };
    let nums = collect_numbers(&args[1..2], provider);
    let ties = nums.iter().filter(|x| **x == value).count();
    if ties == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let base = if order_desc {
        1 + nums.iter().filter(|x| **x > value).count()
    } else {
        1 + nums.iter().filter(|x| **x < value).count()
    };
    // Average of base, base+1, ..., base+ties-1.
    let sum: f64 = (0..ties).map(|i| (base + i) as f64).sum();
    Value::Number(sum / ties as f64)
}

/// Shared linear-interpolated percentile. Used by PERCENTILE and QUARTILE.
pub(super) fn percentile_impl(range_args: &[Expr], provider: &dyn EvalProvider, k: f64) -> Value {
    if !k.is_finite() || k < 0.0 || k > 1.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut nums = collect_numbers(range_args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    let pos = k * (n as f64 - 1.0);
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    if lo == hi {
        Value::Number(nums[lo])
    } else {
        let frac = pos - lo as f64;
        Value::Number(nums[lo] + (nums[hi] - nums[lo]) * frac)
    }
}

/// Exclusive percentile (Excel 2010+ `PERCENTILE.EXC` / `QUARTILE.EXC`).
///
/// `k` must be strictly in `(0, 1)`. The 1-based rank is `k * (n + 1)`; if
/// that falls below 1 or above `n` the result is #VALUE!. Otherwise the
/// surrounding pair is linearly interpolated, same as `percentile_impl`.
pub(super) fn percentile_exc_impl(range_args: &[Expr], provider: &dyn EvalProvider, k: f64) -> Value {
    if !k.is_finite() || k <= 0.0 || k >= 1.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut nums = collect_numbers(range_args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    // 1-based position. Excel: pos = k * (n + 1).
    let pos = k * (n as f64 + 1.0);
    if pos < 1.0 || pos > n as f64 {
        return Value::Error(ValueError::InvalidValue);
    }
    // Convert to 0-based interpolation bounds.
    let zero_based = pos - 1.0;
    let lo = zero_based.floor() as usize;
    let hi = zero_based.ceil() as usize;
    if lo == hi {
        Value::Number(nums[lo])
    } else {
        let frac = zero_based - lo as f64;
        Value::Number(nums[lo] + (nums[hi] - nums[lo]) * frac)
    }
}

/// Walk two range arguments in parallel and collect (x, y) pairs where BOTH
/// cells are numeric. Returns:
///   - Ok(Vec<(x, y)>) on success
///   - Err(ValueError) on shape mismatch (#VALUE!), non-range args (#VALUE!),
///     or propagated cell errors.
///
/// Both arguments must be the same shape (rows × cols). For 1×N vs N×1
/// orientations the shape must still match exactly — Excel allows mixed
/// orientations there, but we keep it strict (consistent with our 2D grid
/// model) and document the limitation.
pub(super) fn collect_paired_numbers(
    a: &Expr,
    b: &Expr,
    provider: &dyn EvalProvider,
) -> Result<Vec<(f64, f64)>, ValueError> {
    let grid_a = match collect_range_2d_for_arg(a, provider) {
        Some(g) => g,
        None => return Err(ValueError::InvalidValue),
    };
    let grid_b = match collect_range_2d_for_arg(b, provider) {
        Some(g) => g,
        None => return Err(ValueError::InvalidValue),
    };
    let rows_a = grid_a.len();
    let cols_a = grid_a.first().map(|r| r.len()).unwrap_or(0);
    let rows_b = grid_b.len();
    let cols_b = grid_b.first().map(|r| r.len()).unwrap_or(0);
    if rows_a != rows_b || cols_a != cols_b {
        return Err(ValueError::InvalidValue);
    }
    let mut pairs: Vec<(f64, f64)> = Vec::new();
    for r in 0..rows_a {
        for c in 0..cols_a {
            let va = &grid_a[r][c];
            let vb = &grid_b[r][c];
            if let Value::Error(e) = va {
                return Err(e.clone());
            }
            if let Value::Error(e) = vb {
                return Err(e.clone());
            }
            if let (Value::Number(x), Value::Number(y)) = (va, vb) {
                pairs.push((*x, *y));
            }
        }
    }
    Ok(pairs)
}

/// CORREL(arr1, arr2). See dispatcher comment for semantics.
pub(super) fn correl_impl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0_f64;
    let mut sxx = 0.0_f64;
    let mut syy = 0.0_f64;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    let denom = (sxx * syy).sqrt();
    if denom == 0.0 || !denom.is_finite() {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number(sxy / denom)
}

/// Covariance (population or sample). `sum((x-mx) * (y-my)) / divisor`,
/// where divisor is `n` for population (`COVAR` / `COVAR.P`) and `n - 1`
/// for sample (`COVAR.S`). Shares range-pair and shape rules with CORREL.
pub(super) fn covar_impl(args: &[Expr], provider: &dyn EvalProvider, sample: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.is_empty() {
        return Value::Error(ValueError::DivisionByZero);
    }
    if sample && pairs.len() < 2 {
        // Sample covariance is undefined for a single pair (n - 1 == 0).
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let sxy: f64 = pairs.iter().map(|(x, y)| (*x - mx) * (*y - my)).sum();
    let divisor = if sample { n - 1.0 } else { n };
    Value::Number(sxy / divisor)
}

/// Shared SLOPE / INTERCEPT body. Args are (y_array, x_array).
/// `as_intercept = true` returns ȳ - slope * x̄; otherwise returns slope.
pub(super) fn slope_intercept_impl(args: &[Expr], provider: &dyn EvalProvider, as_intercept: bool) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // args[0] is y, args[1] is x. We feed (x, y) into collect_paired_numbers
    // so existing pair semantics line up with the math below.
    let pairs = match collect_paired_numbers(&args[1], &args[0], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0_f64;
    let mut sxx = 0.0_f64;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
    }
    if sxx == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let slope = sxy / sxx;
    if as_intercept {
        Value::Number(my - slope * mx)
    } else {
        Value::Number(slope)
    }
}
