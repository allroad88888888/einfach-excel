use super::*;

pub(super) fn coup_period_days(frequency: i64, basis: i64) -> f64 {
    match basis {
        0 | 2 | 4 => 360.0 / frequency as f64,
        3 => 365.0 / frequency as f64,
        // basis 1 (actual/actual): we approximate with the average year
        // length; callers that need the actual period split use
        // prev/next_coupon_date together with day_diff.
        1 => 365.25 / frequency as f64,
        _ => f64::NAN,
    }
}

/// Previous coupon date strictly <= settlement, derived by walking back
/// from maturity in whole coupon periods. We use a date-arithmetic walk
/// (subtract `12 / frequency` months) rather than serial subtraction so
/// month-end semantics line up with Excel's coupon-date conventions.
pub(super) fn prev_coupon_date(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let months_per_period = 12 / frequency as i32;
    let (my, mm, md) = date_from_serial(maturity);
    let mut k = 0i32;
    loop {
        let total_months = (my * 12 + (mm as i32 - 1)) - k * months_per_period;
        let ny = total_months.div_euclid(12);
        let nm = (total_months.rem_euclid(12) + 1) as u32;
        // Day-of-month clamp to last day of target month.
        let dom = days_in_month(ny, nm);
        let nd = md.min(dom);
        let serial = date_serial(ny, nm, nd);
        if serial <= settlement {
            return serial;
        }
        k += 1;
        if k > 4_000 {
            // Safety net: ~1000 years on quarterly bonds; bail out so we
            // never spin forever on a malformed input.
            return serial;
        }
    }
}

/// Next coupon date strictly > settlement. Same walk as prev but stops
/// one period earlier.
pub(super) fn next_coupon_date(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let prev = prev_coupon_date(settlement, maturity, frequency);
    let months_per_period = 12 / frequency as i32;
    let (py, pm, pd) = date_from_serial(prev);
    let total_months = py * 12 + (pm as i32 - 1) + months_per_period;
    let ny = total_months.div_euclid(12);
    let nm = (total_months.rem_euclid(12) + 1) as u32;
    let dom = days_in_month(ny, nm);
    let nd = pd.min(dom);
    date_serial(ny, nm, nd)
}

/// Number of coupons from settlement to maturity (rounded up to whole
/// coupons). Used by COUPNUM and PRICE's `N`.
pub(super) fn coup_num(settlement: f64, maturity: f64, frequency: i64) -> f64 {
    let months_per_period = 12 / frequency as i32;
    let (sy, sm, _sd) = date_from_serial(settlement);
    let (my, mm, _md) = date_from_serial(maturity);
    let months_between = (my * 12 + mm as i32 - 1) - (sy * 12 + sm as i32 - 1);
    let raw = months_between as f64 / months_per_period as f64;
    // Settlement strictly before any coupon contributes a fractional
    // period — round up to a whole coupon count.
    raw.ceil().max(1.0)
}

/// Coupon-period split (A, DSC, E) at `settlement` in days. Returned
/// triple is `(A = days from prev coupon to settlement, DSC = days from
/// settlement to next coupon, E = days in coupon period)`. We pin DSC + A = E
/// so that at exact coupon boundaries DSC/E = 1.0 and A/E = 0.0 (the
/// invariant that drives PRICE_at_par_yield = par).
pub(super) fn coup_period_split(
    settlement: f64,
    maturity: f64,
    frequency: i64,
    basis: i64,
) -> (f64, f64, f64) {
    let pcd = prev_coupon_date(settlement, maturity, frequency);
    let ncd = next_coupon_date(settlement, maturity, frequency);
    // For basis 1 and 3 we use the real day diff; for 0/2/4 we use the
    // canonical 30/360 period length so A + DSC = E exactly.
    let e_real = day_diff(pcd, ncd).max(1.0);
    let e_canonical = coup_period_days(frequency, basis);
    let (a_real, dsc_real) = (
        day_diff(pcd, settlement).max(0.0),
        day_diff(settlement, ncd).max(0.0),
    );
    match basis {
        0 | 2 | 4 => {
            // Map the real fractional position onto the canonical period
            // length. A/E and DSC/E thus depend only on where settlement
            // falls within the period, not the basis-specific year length.
            let frac = if e_real > 0.0 { a_real / e_real } else { 0.0 };
            let a = e_canonical * frac;
            (a, e_canonical - a, e_canonical)
        }
        _ => (a_real, dsc_real, e_real),
    }
}

/// Clean-price ("PRICE") computation pulled out so YIELD's Newton solver
/// can re-use it without re-parsing arguments.
pub(super) fn price_from_yield(
    settlement: f64,
    maturity: f64,
    rate: f64,
    yld: f64,
    redemption: f64,
    frequency: i64,
    basis: i64,
) -> Result<f64, ValueError> {
    let (a, dsc, e) = coup_period_split(settlement, maturity, frequency, basis);
    if !e.is_finite() || e <= 0.0 {
        return Err(ValueError::InvalidValue);
    }
    // N = coupons remaining from settlement to maturity (inclusive of the
    // last one). The largest k such that pcd + k*period <= maturity.
    let n = coup_num(settlement, maturity, frequency);
    let f = frequency as f64;
    let dsc_e = (dsc / e).max(0.0);
    let coupon = 100.0 * rate / f;
    let one_plus = 1.0 + yld / f;
    if one_plus <= 0.0 {
        return Err(ValueError::Overflow);
    }
    // Redemption discount: redemption / (1+y/f)^(N-1+DSC/E).
    let redemp = redemption / one_plus.powf(n - 1.0 + dsc_e);
    let mut coupons_pv = 0.0_f64;
    let n_int = n as i64;
    for k in 1..=n_int {
        let exp = (k as f64) - 1.0 + dsc_e;
        coupons_pv += coupon / one_plus.powf(exp);
    }
    let accrued = coupon * a / e;
    let price = redemp + coupons_pv - accrued;
    if !price.is_finite() {
        return Err(ValueError::Overflow);
    }
    Ok(price)
}
