use super::*;

pub(super) fn stat_num(arg: &Expr, provider: &dyn EvalProvider) -> Result<f64, Value> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(Value::Error(e));
    }
    match coerce_to_number(&v) {
        Some(n) => Ok(n),
        None => Err(Value::Error(ValueError::WrongType)),
    }
}

pub(super) fn stat_bool(arg: &Expr, provider: &dyn EvalProvider) -> Result<bool, Value> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(Value::Error(e));
    }
    match coerce_to_bool(&v) {
        Some(b) => Ok(b),
        None => Err(Value::Error(ValueError::WrongType)),
    }
}

pub(super) fn stat_finite(n: f64) -> Value {
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn stat_norm_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Normal};
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
    if !(sd > 0.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match Normal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(if cumulative { dist.cdf(x) } else { dist.pdf(x) })
}

pub(super) fn stat_norm_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
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
    let dist = match Normal::new(mean, sd) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(dist.inverse_cdf(p))
}

pub(super) fn stat_norm_s_dist(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{Continuous, ContinuousCDF, Normal};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let z = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let cumulative = match stat_bool(&args[1], provider) {
        Ok(b) => b,
        Err(e) => return e,
    };
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(if cumulative { dist.cdf(z) } else { dist.pdf(z) })
}

pub(super) fn stat_norm_s_inv(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let p = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !(p > 0.0 && p < 1.0) {
        return Value::Error(ValueError::Overflow);
    }
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(dist.inverse_cdf(p))
}
