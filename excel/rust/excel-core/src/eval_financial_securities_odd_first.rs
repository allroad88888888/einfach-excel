use super::*;

pub(super) fn add_coupon_periods(quasi_date: f64, frequency: i64, k: i32) -> f64 {
    let months_per_period = (12 / frequency) as i32;
    let (qy, qm, qd) = date_from_serial(quasi_date);
    let total_months = qy * 12 + (qm as i32 - 1) + k * months_per_period;
    let ny = total_months.div_euclid(12);
    let nm = (total_months.rem_euclid(12) + 1) as u32;
    let dom = days_in_month(ny, nm);
    let nd = qd.min(dom);
    date_serial(ny, nm, nd)
}

/// Count quasi-coupon dates strictly after `start` and ≤ `end`.
pub(super) fn nc_quasi_dates_between(start: f64, end: f64, frequency: i64) -> i32 {
    if end <= start {
        return 0;
    }
    let months_per_period = (12 / frequency) as i32;
    let (ey, em, ed) = date_from_serial(end);
    let mut k: i32 = 0;
    loop {
        let total_months = ey * 12 + (em as i32 - 1) - k * months_per_period;
        let ny = total_months.div_euclid(12);
        let nm = (total_months.rem_euclid(12) + 1) as u32;
        let dom = days_in_month(ny, nm);
        let nd = ed.min(dom);
        let serial = date_serial(ny, nm, nd);
        if serial <= start {
            return k;
        }
        k += 1;
        if k > 4_000 {
            return k;
        }
    }
}

/// ODDFPRICE — price per $100 face with an odd first coupon period.
/// Short odd (issue inside the prev-quasi → first_coupon period): first
/// coupon payment = coupon * DFC (period-fraction issue→first_coupon).
/// Long odd: walk back from first_coupon in whole quasi-periods to the
/// period containing issue; first coupon payment scales by the sum of
/// full intermediate periods plus the partial issue-period fraction.
/// Discounts the first coupon at exponent DSC (settlement→first_coupon
/// in periods), standard coupons at DSC + (k-1) for k ∈ 2..=N, and
/// redemption at DSC + (N-1).
pub(super) fn oddfprice_from_yield(
    settlement: f64,
    maturity: f64,
    issue: f64,
    first_coupon: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let f = frequency as f64;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    let coupon = 100.0 * rate / f;
    let n_regular = nc_quasi_dates_between(first_coupon, maturity, frequency);
    let n_total = n_regular + 1;
    let dsc = yearfrac_basis(settlement, first_coupon, basis)? * f;

    let prev_quasi = add_coupon_periods(first_coupon, frequency, -1);
    let (first_cpn, accrued) = if prev_quasi <= issue {
        // Short odd first period.
        let dfc = yearfrac_basis(issue, first_coupon, basis)? * f;
        let a = yearfrac_basis(issue, settlement, basis)? * f;
        (coupon * dfc, coupon * a)
    } else {
        // Long odd first period.
        let nq = nc_quasi_dates_between(issue, first_coupon, frequency).max(1);
        let mut quasi_dates: Vec<f64> = Vec::with_capacity((nq + 1) as usize);
        for i in 0..=nq {
            quasi_dates.push(add_coupon_periods(first_coupon, frequency, -i));
        }
        let q_issue_lo = quasi_dates[nq as usize];
        let q_issue_hi = quasi_dates[(nq - 1) as usize];
        let nl_issue = (q_issue_hi - q_issue_lo).max(1.0);
        let dci_frac = ((q_issue_hi - issue).max(0.0)) / nl_issue;
        let first_period_cpn_frac = dci_frac + (nq as f64 - 1.0);
        let accrued_periods = if settlement <= q_issue_hi {
            ((settlement - issue).max(0.0)) / nl_issue
        } else {
            let mut frac = dci_frac;
            let mut found = false;
            for i in 1..nq {
                let q_lo = quasi_dates[(nq - i) as usize];
                let q_hi = quasi_dates[(nq - i - 1) as usize];
                if settlement >= q_lo && settlement <= q_hi {
                    let nl = (q_hi - q_lo).max(1.0);
                    frac += ((settlement - q_lo).max(0.0)) / nl;
                    found = true;
                    break;
                } else {
                    frac += 1.0;
                }
            }
            if !found {
                frac = first_period_cpn_frac;
            }
            frac
        };
        (coupon * first_period_cpn_frac, coupon * accrued_periods)
    };

    let mut pv = first_cpn / one_plus.powf(dsc);
    for k in 2..=n_total {
        let exp = dsc + (k as f64 - 1.0);
        pv += coupon / one_plus.powf(exp);
    }
    let redemp = redemption / one_plus.powf(dsc + (n_total as f64 - 1.0));
    let price = pv + redemp - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}

pub(super) fn fn_oddfprice(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 8 || args.len() > 9 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let settlement = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let maturity = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let issue = match fin_coerce(&args[2], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let first_coupon = match fin_coerce(&args[3], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let rate = match fin_coerce(&args[4], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let yld = match fin_coerce(&args[5], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let redemption = match fin_coerce(&args[6], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let frequency = match fin_coerce(&args[7], provider) {
        Ok(v) => v.trunc() as i64,
        Err(e) => return Value::Error(e),
    };
    let basis = match fin_basis(args, 8, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if !matches!(frequency, 1 | 2 | 4) {
        return Value::Error(ValueError::Overflow);
    }
    if rate < 0.0
        || yld < 0.0
        || redemption <= 0.0
        || issue >= settlement
        || settlement >= first_coupon
        || first_coupon >= maturity
    {
        return Value::Error(ValueError::Overflow);
    }
    match oddfprice_from_yield(
        settlement,
        maturity,
        issue,
        first_coupon,
        rate,
        yld,
        redemption,
        frequency,
        basis,
    ) {
        Ok(p) => Value::Number(p),
        Err(e) => Value::Error(e),
    }
}
