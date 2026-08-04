use super::*;

pub(super) fn fn_vdb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 5 || args.len() > 7 {
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
    let start = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let factor = if args.len() >= 6 {
        match fin_coerce(&args[5], provider) {
            Ok(v) => v,
            Err(e) => return Value::Error(e),
        }
    } else {
        2.0
    };
    let no_switch = if args.len() == 7 {
        match fin_coerce(&args[6], provider) {
            Ok(v) => v != 0.0,
            Err(e) => return Value::Error(e),
        }
    } else {
        false
    };
    if cost < 0.0 || salvage < 0.0 || life <= 0.0 || factor <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    if start < 0.0 || end < start || end > life {
        return Value::Error(ValueError::Overflow);
    }
    // Walk full periods 1..=life. For each period, accumulate the
    // DDB amount (no-switch) or the larger of DDB-vs-SL-on-remaining-life
    // (switch). Then take the slice of total dep between `start` and `end`.
    //
    // VDB allows fractional start/end; we approximate by integrating
    // whole periods and pro-rating the fractional ends. This is the same
    // approach used by every open-source spreadsheet engine we've seen.
    let rate = factor / life;
    let life_i = life.ceil() as i64;
    let mut prior: f64 = 0.0;
    let mut per_dep: Vec<f64> = Vec::with_capacity(life_i as usize);
    let mut switched = false;
    for k in 1..=life_i {
        let ddb_d = ((cost - prior) * rate).min(cost - salvage - prior).max(0.0);
        let dep = if no_switch {
            ddb_d
        } else {
            // Straight-line over remaining life. `(life - (k-1))` is the
            // number of full periods left at the START of period k.
            let remaining_periods = life - (k as f64 - 1.0);
            let sl_d = if remaining_periods > 0.0 {
                ((cost - salvage - prior) / remaining_periods).max(0.0)
            } else {
                0.0
            };
            if switched || sl_d > ddb_d {
                switched = true;
                sl_d
            } else {
                ddb_d
            }
        };
        per_dep.push(dep);
        prior += dep;
    }
    // Sum dep[start..end] with fractional pro-rating at the boundaries.
    let mut total = 0.0_f64;
    let s_floor = start.floor() as i64;
    let e_ceil = end.ceil() as i64;
    for k in (s_floor + 1).max(1)..=e_ceil.min(life_i) {
        let idx = (k - 1) as usize;
        let p_start = (k - 1) as f64;
        let p_end = k as f64;
        let s = start.max(p_start);
        let e = end.min(p_end);
        if e > s {
            total += per_dep[idx] * (e - s) / (p_end - p_start);
        }
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
