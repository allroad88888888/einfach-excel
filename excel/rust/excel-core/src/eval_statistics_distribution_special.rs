use super::*;

pub(super) fn stat_gamma_func(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::gamma::gamma;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    // Gamma function: undefined for 0 and negative integers (poles).
    if x == 0.0 || (x < 0.0 && x.trunc() == x) {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(gamma(x))
}

pub(super) fn stat_gammaln(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::gamma::ln_gamma;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(ln_gamma(x))
}

pub(super) fn stat_erf(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::erf::erf;
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let lower = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if args.len() == 1 {
        stat_finite(erf(lower))
    } else {
        let upper = match stat_num(&args[1], provider) {
            Ok(n) => n,
            Err(e) => return e,
        };
        // Two-arg form: erf(upper) - erf(lower).
        stat_finite(erf(upper) - erf(lower))
    }
}

pub(super) fn stat_erfc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::function::erf::erfc;
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    stat_finite(erfc(x))
}

pub(super) fn stat_kurt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 4 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sum4 = nums.iter().map(|x| ((x - mean) / s).powi(4)).sum::<f64>();
    let k = (n * (n + 1.0)) / ((n - 1.0) * (n - 2.0) * (n - 3.0)) * sum4
        - 3.0 * (n - 1.0).powi(2) / ((n - 2.0) * (n - 3.0));
    stat_finite(k)
}

pub(super) fn stat_skew(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    let n = nums.len() as f64;
    if nums.len() < 3 {
        return Value::Error(ValueError::Overflow);
    }
    let mean = nums.iter().sum::<f64>() / n;
    let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let s = var.sqrt();
    if s == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let sum3 = nums.iter().map(|x| ((x - mean) / s).powi(3)).sum::<f64>();
    let sk = n / ((n - 1.0) * (n - 2.0)) * sum3;
    stat_finite(sk)
}

pub(super) fn stat_avedev(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = nums.len() as f64;
    let mean = nums.iter().sum::<f64>() / n;
    let sum_abs: f64 = nums.iter().map(|x| (x - mean).abs()).sum();
    stat_finite(sum_abs / n)
}

pub(super) fn stat_devsq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Number(0.0);
    }
    let n = nums.len() as f64;
    let mean = nums.iter().sum::<f64>() / n;
    stat_finite(nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>())
}

pub(super) fn stat_geomean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    // All values must be strictly positive; else #NUM!.
    for &v in &nums {
        if v <= 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    // Use log-mean to avoid overflow on large products.
    let n = nums.len() as f64;
    let log_mean = nums.iter().map(|x| x.ln()).sum::<f64>() / n;
    stat_finite(log_mean.exp())
}

pub(super) fn stat_harmean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let nums = collect_numbers(args, provider);
    if nums.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    for &v in &nums {
        if v <= 0.0 {
            return Value::Error(ValueError::Overflow);
        }
    }
    let n = nums.len() as f64;
    let inv_sum: f64 = nums.iter().map(|x| 1.0 / x).sum();
    stat_finite(n / inv_sum)
}

pub(super) fn stat_trimmean(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let percent = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(percent >= 0.0 && percent < 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let mut nums = collect_numbers(&args[..1], provider);
    let n = nums.len();
    if n == 0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Excel rule: total number to trim = floor(n * percent), then round
    // *down* to the nearest even integer so the same count is trimmed from
    // each end. e.g. n=20, percent=0.2 → floor(4)=4, even → trim 2 from
    // each end. n=10, percent=0.2 → floor(2)=2, even → trim 1 from each
    // end. n=10, percent=0.15 → floor(1.5)=1, made even → 0 → trim none.
    let trim_total = (n as f64 * percent).floor() as usize;
    let trim_each = trim_total / 2; // integer divide drops the odd bit -> "round down to even"
    if 2 * trim_each >= n {
        return Value::Error(ValueError::Overflow);
    }
    nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let kept = &nums[trim_each..n - trim_each];
    let mean = kept.iter().sum::<f64>() / kept.len() as f64;
    stat_finite(mean)
}

pub(super) fn stat_standardize(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let mean = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let sd = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if sd <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    stat_finite((x - mean) / sd)
}

pub(super) fn stat_fisher(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x <= -1.0 || x >= 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    stat_finite(0.5 * ((1.0 + x) / (1.0 - x)).ln())
}

pub(super) fn stat_fisherinv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let y = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let e2y = (2.0 * y).exp();
    stat_finite((e2y - 1.0) / (e2y + 1.0))
}
