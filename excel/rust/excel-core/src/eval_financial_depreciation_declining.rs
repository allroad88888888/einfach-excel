use super::*;

pub(super) fn fn_db(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let month = if args.len() == 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v.trunc(),
            Err(e) => return Value::Error(e),
        }
    } else {
        12.0
    };
    if life <= 0.0 || period < 1.0 || month < 1.0 || month > 12.0 {
        return Value::Error(ValueError::Overflow);
    }
    if cost == 0.0 {
        return Value::Number(0.0);
    }
    if salvage < 0.0 || cost < 0.0 || (cost > 0.0 && salvage > cost) {
        return Value::Error(ValueError::Overflow);
    }
    // Excel rounds the rate to 3 decimals.
    let raw_rate = if salvage == 0.0 {
        1.0
    } else {
        1.0 - (salvage / cost).powf(1.0 / life)
    };
    let rate = (raw_rate * 1000.0).round() / 1000.0;
    // The "extra" period beyond `life` is allowed when month < 12; reject
    // anything past `life + 1`.
    let life_i = life.trunc() as i64;
    let per_i = period.trunc() as i64;
    if per_i > life_i + 1 {
        return Value::Error(ValueError::Overflow);
    }
    // Simulate period-by-period. We do a tight closed-form loop because
    // each period's depreciation depends only on running total.
    let mut total: f64 = 0.0;
    let mut last_dep: f64 = 0.0;
    let last_period = per_i.min(life_i + 1);
    for k in 1..=last_period {
        let dep = if k == 1 {
            cost * rate * month / 12.0
        } else if (k as f64) == life + 1.0 {
            (cost - total) * rate * (12.0 - month) / 12.0
        } else {
            (cost - total) * rate
        };
        last_dep = dep;
        total += dep;
    }
    if !last_dep.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(last_dep)
}

pub(super) fn fn_ddb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 4 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let life = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let factor = if args.len() == 5 {
        match fin_coerce(&args[4], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        2.0
    };
    if cost < 0.0 || salvage < 0.0 || life <= 0.0 || period < 1.0 || factor <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if period > life + 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dep = ddb_period(cost, salvage, life, period, factor);
    if dep.is_finite() {
        Value::Number(dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn ddb_period(cost: f64, salvage: f64, life: f64, period: f64, factor: f64) -> f64 {
    let rate = factor / life;
    let mut prior: f64 = 0.0;
    let p_int = period.floor() as i64;
    for _ in 1..p_int {
        let d = ((cost - prior) * rate).min(cost - salvage - prior).max(0.0);
        prior += d;
    }
    ((cost - prior) * rate).min(cost - salvage - prior).max(0.0)
}
