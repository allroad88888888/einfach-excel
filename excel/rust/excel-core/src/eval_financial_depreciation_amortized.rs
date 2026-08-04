use super::*;

pub(super) fn amordegrc_coefficient(life: f64) -> f64 {
    if life > 6.0 {
        2.5
    } else if life > 4.0 {
        2.0
    } else if life > 3.0 {
        1.5
    } else {
        1.0
    }
}

/// AMORDEGRC — French degressive depreciation with rounding per period.
///
/// Signature: AMORDEGRC(cost, date_purchased, first_period, salvage,
/// period, rate, [basis]). Returns the depreciation amount FOR the given
/// `period` (period 0 = first/initial period spanning purchased→first_period).
///
/// Algorithm (Excel-faithful, per Microsoft docs):
///  1. Domain checks:
///       - cost <= 0        → #NUM!
///       - salvage < 0      → #NUM!
///       - salvage >= cost  → #NUM! (no depreciation possible)
///       - period < 0       → #NUM!
///       - rate <= 0 or >=1 → #NUM!
///       - purchased > first_period → #NUM! (we use Overflow per project convention)
///       - basis not in 0..=4 → #VALUE! (delegated to `fin_basis`)
///  2. life = 1 / rate (theoretical full-asset lifetime in years).
///  3. coef = `amordegrc_coefficient(life)`; ddb_rate = rate * coef.
///  4. first_frac = yearfrac(purchased, first_period, basis).
///  5. Period 0 depreciation = round(cost * ddb_rate * first_frac), capped
///     to [0, cost-salvage]. EVERY period (not just the first) rounds to an
///     integer — Excel's documented behavior.
///  6. For each subsequent period p in 1..=period:
///       ddb_dep = round(book * ddb_rate)
///       remaining_periods = max(1, ceil(life) - p)
///       sl_dep = round((book - salvage) / remaining_periods)
///       dep = max(ddb_dep, sl_dep) when the straight-line "per remaining
///         whole period" candidate exceeds DDB (switch-to-SL trigger).
///       Cap dep to [0, book - salvage].
///       book -= dep.
///  7. Last-period (period == ceil(life)) close-out: per Microsoft docs the
///     final period's depreciation is `(book - salvage) * 1.5` capped at
///     `book - salvage` — i.e. effectively `book - salvage` (closes the
///     book exactly to salvage). Implemented explicitly so the cap is
///     visible in source.
///  8. period > ceil(life) → 0 (asset fully depreciated).
pub(super) fn fn_amordegrc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let purchased = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_period = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // basis validated to 0..=4 by `fin_basis`; out-of-range → #VALUE!.
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    // Domain validation (all map to #NUM! per project convention).
    if cost <= 0.0
        || salvage < 0.0
        || salvage >= cost
        || period < 0
        || rate <= 0.0
        || rate >= 1.0
        || purchased > first_period
    {
        return Value::Error(ValueError::Overflow);
    }
    let life = 1.0 / rate;
    let coef = amordegrc_coefficient(life);
    let ddb_rate = rate * coef;
    // Last full period beyond which depreciation drops to 0. With life
    // fractional (e.g. 6.67), the asset is depreciated through ceil(life)
    // = 7 periods. With life integer (e.g. 10), through period 10.
    let last_period: i64 = life.ceil() as i64;

    // Period > life: asset is fully depreciated.
    if period > last_period {
        return Value::Number(0.0);
    }

    let first_frac = match yearfrac_basis(purchased, first_period, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let max_total = cost - salvage;

    // Period 0 (the partial initial period).
    let first_dep = (cost * ddb_rate * first_frac).round();
    let first_dep = first_dep.max(0.0).min(max_total);
    if period == 0 {
        return if first_dep.is_finite() {
            Value::Number(first_dep)
        } else {
            Value::Error(ValueError::Overflow)
        };
    }

    let mut book = cost - first_dep;
    let mut last_dep = first_dep;

    for p in 1..=period {
        // End-of-life close-out: per Excel, the final period's
        // depreciation is (book - salvage) * 1.5 capped at (book - salvage).
        // Net effect: drain remaining book to salvage exactly.
        if p == last_period {
            let remaining = (book - salvage).max(0.0);
            // 1.5x with cap = remaining → effectively closes book to salvage.
            last_dep = (remaining * 1.5).min(remaining).max(0.0);
            break;
        }
        // DDB candidate, rounded per period (every period, not just first).
        let ddb_dep = (book * ddb_rate).round();
        // Switch-to-straight-line trigger: when remaining (book-salvage)
        // spread over remaining WHOLE periods exceeds the DDB candidate,
        // we depreciate the straight-line amount instead.
        let remaining_periods = (last_period - p).max(1);
        let sl_dep = ((book - salvage) / remaining_periods as f64).round();
        let mut dep = if sl_dep > ddb_dep { sl_dep } else { ddb_dep };
        // Cap so book never crosses salvage.
        dep = dep.max(0.0).min((book - salvage).max(0.0));
        last_dep = dep;
        book -= dep;
        if book <= salvage {
            // Reached salvage early; further periods (still up to the
            // requested `period`) yield 0.
            if p < period {
                last_dep = 0.0;
            }
            break;
        }
    }

    if last_dep.is_finite() {
        Value::Number(last_dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) fn fn_amorlinc(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 6 || args.len() > 7 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let cost = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let purchased = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_period = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let salvage = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let period = match fin_coerce(&args[4], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 6, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if cost <= 0.0 || rate <= 0.0 || period < 0 || salvage < 0.0 || salvage >= cost {
        return Value::Error(ValueError::Overflow);
    }
    let first_frac = match yearfrac_basis(purchased, first_period, basis) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let annual = cost * rate;
    let first_dep = (cost * rate * first_frac).round();
    if period == 0 {
        return Value::Number(first_dep.max(0.0).min(cost - salvage));
    }
    // Each subsequent full period depreciates `cost * rate` until book
    // reaches salvage; last period adjusts to land exactly at salvage.
    let mut book = cost - first_dep;
    let mut last_dep = first_dep;
    for _ in 1..=period {
        if book <= salvage {
            last_dep = 0.0;
            break;
        }
        let dep = annual.min(book - salvage).max(0.0);
        last_dep = dep;
        book -= dep;
    }
    if last_dep.is_finite() {
        Value::Number(last_dep)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
