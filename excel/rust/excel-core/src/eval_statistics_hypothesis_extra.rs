use super::*;

pub(super) fn stat_confidence_t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let alpha = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let stdev = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(alpha > 0.0 && alpha < 1.0) || !(stdev > 0.0) || size < 2.0 {
        return Value::Error(ValueError::Overflow);
    }
    let n_int = size.trunc();
    let df = n_int - 1.0;
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail inverse: P(|T| > t) = alpha  →  P(T > t) = alpha/2.
    let t_crit = dist.inverse_cdf(1.0 - alpha / 2.0);
    stat_finite(t_crit * stdev / n_int.sqrt())
}

// BINOM.DIST.RANGE(trials, prob, lower[, upper]).
// Validation: integer trials ≥ 0, 0 ≤ prob ≤ 1, 0 ≤ lower ≤ trials and
// (if present) lower ≤ upper ≤ trials. Bounds are truncated to integers.
pub(super) fn stat_binom_dist_range(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, Discrete};
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let trials = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lower = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let upper = if args.len() == 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        lower
    };
    if !(p >= 0.0 && p <= 1.0) || trials < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let trials_i = trials.trunc() as i64;
    let lower_i = lower.trunc() as i64;
    let upper_i = upper.trunc() as i64;
    if lower_i < 0 || upper_i < lower_i || upper_i > trials_i {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Binomial::new(p, trials_i as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let mut acc = 0.0_f64;
    for k in lower_i..=upper_i {
        acc += dist.pmf(k as u64);
    }
    stat_finite(acc)
}

// PERMUT(n, k) — `n! / (n - k)!`. Inputs truncated; negatives or k > n
// give #NUM!. Cap at n = 170 to avoid f64 overflow (170! is the
// largest representable factorial in f64).
pub(super) fn stat_permut(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let n_f = match stat_num(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let k_f = match stat_num(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = n_f.trunc();
    let k = k_f.trunc();
    if n < 0.0 || k < 0.0 || k > n {
        return Value::Error(ValueError::Overflow);
    }
    let n_i = n as u64;
    let k_i = k as u64;
    let mut acc = 1.0_f64;
    // Product of the top k descending integers: n * (n-1) * … * (n-k+1).
    for i in 0..k_i {
        acc *= (n_i - i) as f64;
        if !acc.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
    }
    Value::Number(acc)
}

// PERMUTATIONA(n, k) — `n^k` (permutations with repetition).
pub(super) fn stat_permutationa(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let n_f = match stat_num(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let k_f = match stat_num(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = n_f.trunc();
    let k = k_f.trunc();
    if n < 0.0 || k < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    // Special case 0^0 = 1 (Excel parity).
    if n == 0.0 && k == 0.0 {
        return Value::Number(1.0);
    }
    let r = n.powf(k);
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
