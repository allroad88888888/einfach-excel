use super::*;

pub(super) fn stat_chisq_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, Continuous, ContinuousCDF};
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
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_chisq_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
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
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

pub(super) fn stat_chisq_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p < 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

pub(super) fn stat_chisq_inv_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let df = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(1.0 - p))
}

pub(super) fn stat_expon_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Exp};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let lambda = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[2], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(lambda > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Exp::new(lambda) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_weibull_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Weibull};
    if args.len() != 4 {
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
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(alpha > 0.0) || !(beta > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    // Excel: WEIBULL.DIST(x, shape=alpha, scale=beta). statrs::Weibull::new
    // takes (shape, scale) in that order — same convention.
    let dist = match Weibull::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}
