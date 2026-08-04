use super::*;

pub(super) fn stat_t_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, StudentsT};
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
    if !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_t_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
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
    // Excel: T.DIST.RT requires x >= 0 (returns #NUM! for negative).
    if !(df > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

pub(super) fn stat_t_dist_2t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
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
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(2.0 * (1.0 - dist.cdf(x)))
}

pub(super) fn stat_t_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
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
    if !(p > 0.0 && p < 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

pub(super) fn stat_t_inv_2t(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
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
    // p ∈ (0, 1]. p=0 invalid (would yield infinity).
    if !(p > 0.0 && p <= 1.0) || !(df > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail: find x s.t. P(|T| > x) = p  →  P(T > x) = p/2  →  x = invCDF(1 - p/2).
    stat_finite(dist.inverse_cdf(1.0 - p / 2.0))
}

pub(super) fn stat_f_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, FisherSnedecor};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[3], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    if !(d1 > 0.0) || !(d2 > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_f_dist_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(d1 > 0.0) || !(d2 > 0.0) || x < 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(x))
}

pub(super) fn stat_f_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p >= 0.0 && p < 1.0) || !(d1 > 0.0) || !(d2 > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

pub(super) fn stat_f_inv_rt(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d1 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let d2 = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p <= 1.0) || !(d1 > 0.0) || !(d2 > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match FisherSnedecor::new(d1, d2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(1.0 - p))
}
