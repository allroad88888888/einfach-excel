use super::*;

pub(super) fn stat_beta_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, Continuous, ContinuousCDF};
    if !(4..=6).contains(&args.len()) {
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
    let a = if args.len() >= 5 {
        match stat_num(&args[4], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        0.0
    };
    let b = if args.len() == 6 {
        match stat_num(&args[5], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        1.0
    };
    if !(alpha > 0.0) || !(beta > 0.0) || !(b > a) {
        return Value::Error(ValueError::Overflow);
    }
    if x < a || x > b {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Map x ∈ [a,b] → u ∈ [0,1].
    let u = (x - a) / (b - a);
    if cumulative {
        stat_finite(dist.cdf(u))
    } else {
        // PDF transforms by chain rule: f_X(x) = f_U(u) / (b - a).
        stat_finite(dist.pdf(u) / (b - a))
    }
}

pub(super) fn stat_beta_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Beta, ContinuousCDF};
    if !(3..=5).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
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
    if !(p >= 0.0 && p <= 1.0) || !(alpha > 0.0) || !(beta > 0.0) || !(b > a) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Beta::new(alpha, beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let u = dist.inverse_cdf(p);
    stat_finite(a + u * (b - a))
}

pub(super) fn stat_gamma_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Gamma};
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
    let dist = match Gamma::new(alpha, 1.0 / beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_gamma_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Gamma};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
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
    if !(p >= 0.0 && p < 1.0) || !(alpha > 0.0) || !(beta > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Gamma::new(alpha, 1.0 / beta) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}
