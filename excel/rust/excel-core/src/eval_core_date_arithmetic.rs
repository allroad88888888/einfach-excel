use super::*;

/// Gregorian leap-year rule. Mirrors the local helper inside `date_serial`
/// / `date_from_serial`, exposed at module scope so the date arithmetic
/// helpers below can share it.
pub(super) fn is_leap_year(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

/// Number of days in month `m` of year `y`. Month is 1-based (1..=12).
pub(super) fn days_in_month(y: i32, m: u32) -> u32 {
    const DOM: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if m == 0 || m > 12 {
        return 0;
    }
    let mut d = DOM[(m - 1) as usize];
    if m == 2 && is_leap_year(y) {
        d += 1;
    }
    d
}

/// Shift `(year, month)` by `delta` months, handling negative deltas and
/// month overflow. Returns `(new_year, new_month)` with `new_month` in 1..=12.
pub(super) fn shift_year_month(year: i32, month: u32, delta: i64) -> (i32, u32) {
    // Convert to 0-based total months from year 0.
    let total: i64 = year as i64 * 12 + (month as i64 - 1) + delta;
    let new_year = total.div_euclid(12) as i32;
    let new_month = (total.rem_euclid(12) + 1) as u32;
    (new_year, new_month)
}

// === Financial helpers ===

/// Compounding factor `((1+r)^n - 1) / r`, with the rate=0 limit `n`.
/// Used by every annuity formula.
// === Math extras helpers ===

/// Shared body for SUMX2MY2 / SUMX2PY2 / SUMXMY2. Collects (x,y) pairs
/// via `collect_paired_numbers` (which enforces same-shape and skips
/// non-numeric cells per offset), then folds with `f`.
// === Bessel + CONVERT helpers ===
//
// Bessel functions are implemented from scratch — statrs 0.16 ships
// gamma/beta/erf but not Bessel, and libm has no Bessel either. The
// approximations below combine Abramowitz & Stegun rational forms for
// the low-order kernels (J0/J1, Y0/Y1, I0/I1, K0/K1) with the
// standard three-term recurrence to reach arbitrary integer order n.
//
// Recurrence stability — important:
//   J_{n+1}(x) =  (2n/x) J_n(x) - J_{n-1}(x)   — forward is unstable
//                 for n > x; use Miller's downward recurrence instead.
//   Y_{n+1}(x) =  (2n/x) Y_n(x) - Y_{n-1}(x)   — forward is stable
//                 (|Y_n| grows in n).
//   I_{n+1}(x) = -(2n/x) I_n(x) + I_{n-1}(x)   — forward is unstable
//                 for n > x; Miller-downward keeps it tame.
//   K_{n+1}(x) =  (2n/x) K_n(x) + K_{n-1}(x)   — forward is stable
//                 (|K_n| grows in n).
//
// Tolerance budget: we aim for ~1e-6 absolute / relative on Excel-typical
// arguments (|x| ≤ 50, n ≤ 20). That matches `TOL = 1e-6` used by the
// statrs-based stat tests elsewhere in this file.

/// Shared entry-point for the four BESSEL* arms. Validates arg count,
/// reads `x` and truncates `n` to integer (Excel's behaviour: `n` is
/// "truncated to integer if it's not an integer"). Negative `n`, NaN
/// args, or a kernel that returns a non-finite value all collapse to
/// `#NUM!`.
// ---------------------------------------------------------------------------
// R-batch helpers: odd-coupon bond pricing + coupon-date utilities + misc
// finance. Uses existing `date_from_serial`, `date_serial`, `days_in_month`,
// `prev_coupon_date`, `next_coupon_date`, `coup_num`, `coup_period_split`,
// `coup_period_days`, `yearfrac_basis`, `fin_basis`, `fin_coerce`, and
// `day_diff` from the rest of the eval module.
// ---------------------------------------------------------------------------

/// Walk forward from a quasi-coupon date by `k` whole coupon periods.
// === Legacy statistical helper functions ===
//
// Wrappers that adapt the canonical Excel-365 `.DIST` / `.INV` signatures
// to the legacy Excel-2007 forms (no cumulative flag, single-arg signed
// form, tails switch, etc.), plus brand-new implementations for the
// four statistical hypothesis tests (CHISQ.TEST / F.TEST / T.TEST /
// Z.TEST), confidence intervals, and the lognormal distribution.

/// Legacy `BETADIST(x, alpha, beta, [A], [B])`. Always returns the
/// cumulative distribution (no boolean cumulative flag). Defaults:
/// `A = 0`, `B = 1`.

/// Linear least-squares core used by LINEST/LOGEST/TREND/GROWTH/FORECAST.
///
/// Inputs:
///   * `xs`: `n × k` matrix of regressors (already log-transformed for
///     LOGEST/GROWTH). One row per observation.
///   * `ys`: length-`n` vector (already log-transformed for LOGEST/GROWTH).
///   * `with_intercept`: when `false`, the model is `y = m1*x1 + …`;
///     when `true`, an implicit column of 1s is appended.
/// Parse the optional 3rd/4th args of LINEST/LOGEST (`const`, `stats`).
/// Default `const` is TRUE, `stats` is FALSE.
/// Extract `known_y` as a `Vec<f64>` and report whether the original
/// shape is vertical (`true` for n×1) or horizontal (`false` for 1×n).
/// LINEST(known_y, [known_x], [const=TRUE], [stats=FALSE]).
/// LOGEST is the same dispatch with `log_y = true`.
/// FORECAST(x, known_y, known_x). Scalar single-variable forecast at `x`.
// === Q batch helpers: RAND / RANDBETWEEN / PERCENTRANK / MODE.MULT /
//     MAXA / MINA / *VAR.A / SKEW.P / FREQUENCY / PROB / GAUSS / PHI ===

/// RAND() — uniform [0, 1). No args. Volatile: every call returns a
/// fresh draw from the OS-seeded thread RNG, so two `RAND()` uses in the
/// same formula give different numbers (Excel parity).
/// MMULT(array1, array2). Matrix product (a×b)·(b×c) → (a×c).
/// `PROB(x_range, prob_range, lower_limit, [upper_limit])` — sum probs for
/// x in [lower, upper]. Verify ∑prob_range ≈ 1 (tolerance 1e-9); any prob
/// ≤ 0 or > 1 → #NUM!. PROB_SUM_TOL is loose enough to absorb FP error from
/// summing 10⁴+ probabilities.
/// Which host-pushed hidden-row sources a SUBTOTAL/AGGREGATE run excludes
/// (`design-filter-hidden-rows` §6.3). Excel's two-layer rule:
///
/// - `SUBTOTAL(1-11)` excludes FILTER-hidden rows but INCLUDES manually
///   hidden ones → [`ExcludeFilter`](Self::ExcludeFilter).
/// - `SUBTOTAL(101-111)` excludes both → [`ExcludeFilterAndManual`].
/// - `AGGREGATE` maps its ignore-hidden option bit (`& 1`, options 1/3/5/7)
///   onto a two-way pick (#32 §6.3, verified on real Excel): bit SET →
///   [`ExcludeFilterAndManual`] (drops BOTH sets), bit CLEAR →
///   [`IncludeAll`](Self::IncludeAll), which touches no provider hook and
///   therefore registers no epoch edge. AGGREGATE never uses the
///   [`ExcludeFilter`](Self::ExcludeFilter) filter-only tier — that is the
///   `SUBTOTAL(1-11)`-only middle case.
///
/// [`ExcludeFilterAndManual`]: Self::ExcludeFilterAndManual
/// EVEN(n) — round AWAY from zero to the nearest even integer.
// === T-batch cleanup helpers (Q1 2026) ===
//
// CONFIDENCE.T half-width: `T.INV.2T(alpha, size - 1) * stdev / sqrt(size)`.
// Validation mirrors CONFIDENCE.NORM: 0 < alpha < 1, stdev > 0, size ≥ 2
// (size = 1 would give zero degrees of freedom).
// DAYS360(start_date, end_date[, method]) — 30/360 day-count.
// method=FALSE (default) → US (NASD) form (basis 0).
// method=TRUE → European form (basis 4).
// Internally we apply the same `(y2-y1)*360 + (m2-m1)*30 + (d2-d1)`
// formula as `yearfrac_basis`, but multiply by 360 (skip the divide).
// The US form clamps `d1 = min(d1, 30)` then if `d1 = 30` clamps
// `d2 = min(d2, 30)` (Excel's NASD30/360 quirk). The European form
// clamps both ends unconditionally.
pub(super) fn date_days360(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let start = match fin_coerce(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let end = match fin_coerce(&args[1], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let european = if args.len() == 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_bool(&v) {
            Some(b) => b,
            None => match coerce_to_number(&v) {
                Some(n) => n != 0.0,
                None => return Value::Error(ValueError::WrongType),
            },
        }
    } else {
        false
    };
    // Reject negative serials (Excel's date model starts at 1900-01-01,
    // which is serial 1; serial 0 is the placeholder Jan 0, 1900). Allow
    // anything ≥ 0.
    if start < 0.0 || end < 0.0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let (y1, m1, d1) = date_from_serial(start);
    let (y2, m2, d2) = date_from_serial(end);
    let (mut d1, mut d2) = (d1 as i64, d2 as i64);
    if european {
        if d1 == 31 {
            d1 = 30;
        }
        if d2 == 31 {
            d2 = 30;
        }
    } else {
        // US (NASD): if d1 == 31 → d1 = 30. Then if d1 == 30 (after the
        // adjustment) AND d2 == 31 → d2 = 30.
        if d1 == 31 {
            d1 = 30;
        }
        if d1 == 30 && d2 == 31 {
            d2 = 30;
        }
    }
    let result = (y2 - y1) as f64 * 360.0 + (m2 as f64 - m1 as f64) * 30.0 + (d2 - d1) as f64;
    Value::Number(result)
}
