use super::*;

pub(super) fn stat_legacy_betadist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, ContinuousCDF};
    if !(3..=5).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let alpha = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let beta = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let a = if args.len() >= 4 {
        match stat_num(&args[3], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        0.0
    };
    let b = if args.len() == 5 {
        match stat_num(&args[4], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        1.0
    };
    if !(alpha > 0.0) || !(beta > 0.0) || !(b > a) || x < a || x > b {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let u = (x - a) / (b - a);
    stat_finite(dist.cdf(u))
}

/// Legacy `HYPGEOMDIST(sample_s, num_sample, pop_s, num_pop)`. Returns
/// the PMF only (no cumulative flag).
pub(super) fn stat_legacy_hypgeomdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, Hypergeometric};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let sample_s = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_sample = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let pop_s = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_pop = match stat_num(&args[3], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    for v in [sample_s, num_sample, pop_s, num_pop] {
        if v < 0.0 || v.trunc() != v {
            return Value::Error(ValueError::Overflow);
        }
    }
    if pop_s > num_pop || num_sample > num_pop || sample_s > num_sample || sample_s > pop_s {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Hypergeometric::new(num_pop as u64, pop_s as u64, num_sample as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.pmf(sample_s as u64))
}

/// Legacy `NEGBINOMDIST(num_f, num_s, prob_s)`. Returns PMF only.
pub(super) fn stat_legacy_negbinomdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, NegativeBinomial};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let num_f = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let num_s = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0)
        || num_f < 0.0
        || num_s < 1.0
        || num_f.trunc() != num_f
        || num_s.trunc() != num_s
    {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match NegativeBinomial::new(num_s, p) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.pmf(num_f as u64))
}

/// Legacy `NORMSDIST(z)` — single-argument form that always returns the
/// standard-normal CDF (Excel's pre-2010 spelling for NORM.S.DIST in
/// cumulative mode).
pub(super) fn stat_legacy_normsdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let z = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.cdf(z))
}

/// Legacy `LOGNORMDIST(x, mean, sd)`. Cumulative only.
pub(super) fn stat_legacy_lognormdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, LogNormal};
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
    if !(sd > 0.0) || x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.cdf(x))
}

/// `LOGNORM.DIST(x, mean, sd, cumulative)`. statrs's `LogNormal` is
/// parameterised by the underlying normal's mean (μ) and stdev (σ),
/// matching Excel's signature directly.
pub(super) fn stat_lognorm_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, LogNormal};
    if args.len() != 4 {
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
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(sd > 0.0) || x <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

/// `LOGNORM.INV(probability, mean, sd)`. Also exposed as legacy
/// `LOGINV`.
pub(super) fn stat_lognorm_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, LogNormal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
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
    if !(p > 0.0 && p < 1.0) || !(sd > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match LogNormal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

/// Legacy `TDIST(x, deg_freedom, tails)`. `tails` must be 1 or 2:
///   - 1 → right-tail probability `P(T > x)`,
///   - 2 → two-tail probability  `P(|T| > x)`.
/// Excel requires `x >= 0`; negative `x` surfaces `#NUM!`.
pub(super) fn stat_legacy_tdist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let tails = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if x < 0.0 || !(df >= 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let tails_i = tails.trunc() as i64;
    if tails.trunc() != tails || (tails_i != 1 && tails_i != 2) {
        return Value::Error(ValueError::Overflow);
    }
    // Excel TDIST truncates df toward zero (it must be >= 1 after truncation).
    let df_trunc = df.trunc();
    if df_trunc < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df_trunc) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let upper_tail = 1.0 - dist.cdf(x);
    stat_finite(if tails_i == 1 {
        upper_tail
    } else {
        2.0 * upper_tail
    })
}
