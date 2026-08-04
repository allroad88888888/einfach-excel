use super::*;

pub(super) fn stat_prob(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.is_empty() {
        return Value::Error(ValueError::Overflow);
    }
    const PROB_SUM_TOL: f64 = 1e-9;
    let mut sum = 0.0_f64;
    for &(_, p) in &pairs {
        if p <= 0.0 || p > 1.0 {
            return Value::Error(ValueError::Overflow);
        }
        sum += p;
    }
    if (sum - 1.0).abs() > PROB_SUM_TOL {
        return Value::Error(ValueError::Overflow);
    }
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
    let (lo, hi) = if lower <= upper {
        (lower, upper)
    } else {
        (upper, lower)
    };
    let mut total = 0.0_f64;
    for &(x, p) in &pairs {
        if x >= lo && x <= hi {
            total += p;
        }
    }
    Value::Number(total)
}

/// GAUSS(x) — `NORM.S.DIST(x, TRUE) - 0.5`.
pub(super) fn stat_gauss(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.cdf(x) - 0.5)
}

/// PHI(x) — standard normal pdf: `exp(-x²/2) / sqrt(2π)`.
pub(super) fn stat_phi(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let two_pi = std::f64::consts::TAU; // 2π
    stat_finite((-0.5 * x * x).exp() / two_pi.sqrt())
}
