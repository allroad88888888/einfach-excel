use super::*;

pub(super) fn stat_rand(args: &[Expr]) -> Value {
    if !args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    use rand::Rng;
    let n: f64 = rand::thread_rng().gen_range(0.0..1.0);
    Value::Number(n)
}

/// RANDBETWEEN(low, high) — uniform integer in `[low, high]` inclusive.
/// Both args truncate toward zero before validation. `low > high` surfaces
/// #NUM! (Overflow), matching Excel.
pub(super) fn stat_randbetween(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let lo = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let hi = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lo_i = lo.trunc() as i64;
    let hi_i = hi.trunc() as i64;
    if lo_i > hi_i {
        return Value::Error(ValueError::Overflow);
    }
    use rand::Rng;
    // gen_range is exclusive on the high bound; widen to i128 to avoid
    // overflow when `hi_i == i64::MAX`.
    let pick = rand::thread_rng().gen_range((lo_i as i128)..(hi_i as i128 + 1));
    Value::Number(pick as f64)
}

/// PERCENTRANK / PERCENTRANK.INC(array, x[, significance=3]).
pub(super) fn stat_percentrank_inc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    percentrank_common(args, provider, /*exclusive=*/ false)
}

/// PERCENTRANK.EXC(array, x[, significance=3]).
pub(super) fn stat_percentrank_exc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    percentrank_common(args, provider, /*exclusive=*/ true)
}

pub(super) fn percentrank_common(args: &[Expr], provider: &dyn EvalProvider, exclusive: bool) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let significance = if args.len() == 3 {
        match stat_num(&args[2], provider) {
            Ok(n) => {
                let s = n.trunc() as i64;
                if s < 1 {
                    return Value::Error(ValueError::Overflow);
                }
                s as u32
            }
            Err(e) => return e,
        }
    } else {
        3
    };
    let mut nums = collect_numbers(&args[..1], provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = nums.len();
    if x < nums[0] || x > nums[n - 1] {
        return Value::Error(ValueError::InvalidValue);
    }
    let (k_lower, exact) = locate_lower(&nums, x);
    let frac = if exact {
        0.0
    } else {
        let lo = nums[k_lower];
        let hi = nums[k_lower + 1];
        (x - lo) / (hi - lo)
    };
    let pos = k_lower as f64 + frac; // 0-based fractional index
    let rank = if exclusive {
        (pos + 1.0) / (n as f64 + 1.0)
    } else if n == 1 {
        1.0
    } else {
        pos / (n as f64 - 1.0)
    };
    Value::Number(truncate_digits(rank, significance))
}

/// Return `(idx, exact)` where `idx` is the largest i with `sorted[i] <= x`,
/// and `exact == true` when `sorted[idx] == x`. Caller has already
/// verified `x` lies in `[sorted[0], sorted[last]]`.
pub(super) fn locate_lower(sorted: &[f64], x: f64) -> (usize, bool) {
    let mut best = 0usize;
    for (i, &v) in sorted.iter().enumerate() {
        if v <= x {
            best = i;
        } else {
            break;
        }
    }
    (best, (sorted[best] - x).abs() == 0.0)
}

/// Truncate `value` to `digits` decimal digits (Excel PERCENTRANK
/// significance semantics — truncation toward zero, not rounding).
pub(super) fn truncate_digits(value: f64, digits: u32) -> f64 {
    if !value.is_finite() {
        return value;
    }
    let scale = 10f64.powi(digits as i32);
    (value * scale).trunc() / scale
}

/// MODE.MULT — array form returning every value tied for the most-frequent
/// count. Returns an n×1 `Value::Array`. If all values are unique, returns
/// `#N/A` (InvalidValue) just like single-value `MODE`.
pub(super) fn stat_mode_mult(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // Bucket integer-quantised numbers exactly like `MODE` does, so 1.0 and
    // 1.0 collide on hash; the 1e9 scale gives 9 decimal digits of fidelity.
    let mut nums: Vec<i64> = Vec::new();
    for arg in args {
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if let Value::Number(n) = v {
                nums.push((n * 1e9).round() as i64);
            }
        });
    }
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut counts: HashMap<i64, usize> = HashMap::new();
    for n in &nums {
        *counts.entry(*n).or_insert(0) += 1;
    }
    let max_count = counts.values().copied().max().unwrap_or(0);
    if max_count <= 1 {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut seen: HashSet<i64> = HashSet::new();
    let mut modes: Vec<Value> = Vec::new();
    for n in &nums {
        if counts[n] == max_count && seen.insert(*n) {
            modes.push(Value::Number(*n as f64 / 1e9));
        }
    }
    let len = modes.len() as u32;
    Value::Array(Arc::new(ArrayData::new(len, 1, modes)))
}

/// Collect numbers + logical + text for the A-variants. Empty cells are
/// skipped; text contributes 0; logical TRUE/FALSE contributes 1/0.
pub(super) fn collect_numbers_a(args: &[Expr], provider: &dyn EvalProvider) -> (Vec<f64>, Option<ValueError>) {
    let mut nums: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for arg in args {
        if err.is_some() {
            break;
        }
        for_each_arg_value(arg, provider, &mut |_addr, v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(e) => err = Some(e),
                Value::Number(n) => nums.push(n),
                Value::Boolean(true) => nums.push(1.0),
                Value::Boolean(false) => nums.push(0.0),
                Value::Text(_) => nums.push(0.0),
                Value::Null => {}
                Value::Array(_) => {}
                Value::Lambda(_) => err = Some(ValueError::WrongType),
            }
        });
    }
    (nums, err)
}

/// MAXA / MINA — A-variant of MAX / MIN.
pub(super) fn stat_max_min_a(args: &[Expr], provider: &dyn EvalProvider, want_max: bool) -> Value {
    let (nums, err) = collect_numbers_a(args, provider);
    if let Some(e) = err {
        return Value::Error(e);
    }
    if nums.is_empty() {
        return Value::Number(0.0);
    }
    let result = if want_max {
        nums.iter().copied().fold(f64::NEG_INFINITY, f64::max)
    } else {
        nums.iter().copied().fold(f64::INFINITY, f64::min)
    };
    stat_finite(result)
}

/// STDEVA / STDEVPA / VARA / VARPA. `sample` selects n-1 vs n; `sqrt`
/// selects STDEV* (return s.d.) vs VAR* (return variance).
pub(super) fn stat_var_a(args: &[Expr], provider: &dyn EvalProvider, sample: bool, sqrt: bool) -> Value {
    let (nums, err) = collect_numbers_a(args, provider);
    if let Some(e) = err {
        return Value::Error(e);
    }
    let n = nums.len();
    if (sample && n < 2) || (!sample && n < 1) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let mean = nums.iter().sum::<f64>() / n as f64;
    let denom = if sample { (n - 1) as f64 } else { n as f64 };
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
    stat_finite(if sqrt { var.sqrt() } else { var })
}

/// SKEW.P — population skewness. Divides moment-3 by `n` and uses
/// population s.d. (vs SKEW which uses the sample n-1 + bias correction).
pub(super) fn stat_skew_p(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 3 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let m3 = nums.iter().map(|x| (x - mean).powi(3)).sum::<f64>() / n;
    stat_finite(m3 / s.powi(3))
}

/// FREQUENCY(data, bins). Returns a `(bins.len() + 1) × 1` column array.
///
/// Tie-handling: ties land in the LOWER bucket (Excel parity — comparison
/// is `x <= bin`, so a value equal to `bins[i]` belongs to bucket `i`,
/// never `i+1`). Bins are sorted ascending before bucketing.
pub(super) fn stat_frequency(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let data = collect_numbers(&args[..1], provider);
    let mut bins = collect_numbers(&args[1..2], provider);
    bins.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let nbins = bins.len();
    let mut counts: Vec<u64> = vec![0; nbins + 1];
    for &x in &data {
        let mut placed = false;
        for (i, &b) in bins.iter().enumerate() {
            if x <= b {
                counts[i] += 1;
                placed = true;
                break;
            }
        }
        if !placed {
            counts[nbins] += 1;
        }
    }
    let out: Vec<Value> = counts
        .into_iter()
        .map(|c| Value::Number(c as f64))
        .collect();
    let rows = (nbins + 1) as u32;
    Value::Array(Arc::new(ArrayData::new(rows, 1, out)))
}
