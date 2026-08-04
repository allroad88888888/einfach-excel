use super::*;

pub(super) fn stat_binom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, Discrete, DiscreteCDF};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let num_s = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let trials = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let p = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p <= 1.0) || trials < 0.0 || num_s < 0.0 || num_s > trials {
        return Value::Error(ValueError::Overflow);
    }
    if num_s.trunc() != num_s || trials.trunc() != trials {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Binomial::new(p, trials as u64) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = num_s as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

pub(super) fn stat_binom_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Binomial, DiscreteCDF};
    if args.len() != 3 {
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
    let alpha = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0)
        || !(alpha > 0.0 && alpha < 1.0)
        || trials < 0.0
        || trials.trunc() != trials
    {
        return Value::Error(ValueError::Overflow);
    }
    let n = trials as u64;
    let dist = match Binomial::new(p, n) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Smallest k s.t. CDF(k) >= alpha. Linear scan is fine for typical n;
    // for very large n statrs's inverse_cdf would do bisection but its
    // default returns u64 and we want exact integer semantics here.
    for k in 0..=n {
        if dist.cdf(k) >= alpha {
            return Value::Number(k as f64);
        }
    }
    // Fallback (shouldn't happen since cdf(n)=1 ≥ alpha): return n.
    Value::Number(n as f64)
}

pub(super) fn stat_poisson_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, DiscreteCDF, Poisson};
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
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(mean > 0.0) || x < 0.0 || x.trunc() != x {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Poisson::new(mean) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let k = x as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

pub(super) fn stat_hypgeom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Discrete, DiscreteCDF, Hypergeometric};
    if args.len() != 5 {
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
    let cumulative = match stat_bool(&args[4], provider) {
        Ok(b) => b,
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
    let k = sample_s as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}

pub(super) fn stat_negbinom_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // Excel NEGBINOM.DIST(num_f, num_s, prob_s, cumulative): number of
    // failures before num_s successes. statrs::NegativeBinomial::new(r, p)
    // takes r = number of successes, p = success prob, and parameterises X
    // as the number of failures, matching Excel.
    use statrs::distribution::{Discrete, DiscreteCDF, NegativeBinomial};
    if args.len() != 4 {
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
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
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
    let k = num_f as u64;
    stat_finite(if cumulative { dist.cdf(k) } else { dist.pmf(k) })
}
