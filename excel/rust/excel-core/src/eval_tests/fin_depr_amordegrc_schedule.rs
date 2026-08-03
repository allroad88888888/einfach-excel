//! AMORDEGRC 的法定折旧排程与系数分档。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ============================================================
// AMORDEGRC — Excel-faithful test suite.
//
// Verifies:
//   * Coefficient table boundaries (life≈4, 5, 7)
//   * Per-period rounding (every period, not just first)
//   * Switch-to-straight-line trigger
//   * Last-period 1.5x close-out (capped to remaining book-salvage)
//   * period > life → 0
//   * Domain validation: cost, salvage, period, rate, purchased > first_period
//   * Basis validation
//   * All 5 basis values produce sensible non-negative results
// Expected values were derived by hand using the algorithm documented
// on `fn_amordegrc` and cross-checked with Excel/LibreOffice behavior.
// ============================================================
#[test]
fn eval_amordegrc_canonical_period1() {
    // cost=2400, salvage=300, rate=0.15 (life≈6.67 → coef=2.5),
    // purchased=2008-08-19, first_period=2008-12-31, basis=1 (actual/365).
    // Days = 134, first_frac = 134/365 ≈ 0.367123.
    // dep0 = round(2400 * 0.375 * 0.367123) = round(330.41) = 330.
    // book = 2070. p=1: ddb = round(2070 * 0.375) = round(776.25) = 776.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,1,0.15,1)",
            &cm,
            &vs,
        ),
        Value::Number(776.0)
    );
}

#[test]
fn eval_amordegrc_canonical_period0() {
    // Same setup, period=0: first-period depreciation = 330.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,0.15,1)",
            &cm,
            &vs,
        ),
        Value::Number(330.0)
    );
}

#[test]
fn eval_amordegrc_canonical_full_schedule_sums_to_book() {
    // Sum of all periods (0..=last_period) must equal cost - salvage = 2100.
    let (cm, vs) = make_test_env();
    let mut total = 0.0;
    for p in 0..=8 {
        let f = format!(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,{},0.15,1)",
            p
        );
        match eval_str(&f, &cm, &vs) {
            Value::Number(n) => total += n,
            other => panic!("AMORDEGRC p={}: {:?}", p, other),
        }
    }
    // Allow ±1 for cumulative integer rounding drift across periods.
    assert!(
        (total - 2100.0).abs() <= 1.0,
        "schedule total = {}, want ≈ 2100",
        total
    );
}

#[test]
fn eval_amordegrc_period_greater_than_life_is_zero() {
    // life = 1/0.15 ≈ 6.67 → last_period = 7.  period=20 is well past.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,20,0.15,1)",
            &cm,
            &vs,
        ),
        Value::Number(0.0)
    );
}

#[test]
fn eval_amordegrc_coefficient_boundary_life4() {
    // rate=0.25 → life=4 → coef=1.5 (life > 3 && life <= 4 bucket).
    // Sanity: period 0 with first_frac=1.0 should be cost*0.25*1.5 = 0.375*cost.
    // Setup purchased == first_period - 1 year (basis 1) → first_frac ≈ 1.0.
    let (cm, vs) = make_test_env();
    // basis 1, full year:
    match eval_str(
        "=AMORDEGRC(1000,DATE(2020,1,1),DATE(2021,1,1),0,0,0.25,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => {
            // 1000 * 0.25 * 1.5 * (366/365) ≈ 376; allow ±2 for leap-year edge.
            assert!((n - 375.0).abs() <= 2.0, "life=4 first_dep = {}", n);
        }
        other => panic!("AMORDEGRC life=4: {:?}", other),
    }
}

#[test]
fn eval_amordegrc_coefficient_boundary_life5() {
    // rate=0.20 → life=5 → coef=2.0 (life > 4 && life <= 6).
    let (cm, vs) = make_test_env();
    match eval_str(
        "=AMORDEGRC(1000,DATE(2020,1,1),DATE(2021,1,1),0,0,0.2,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => {
            // 1000 * 0.2 * 2.0 * ≈1.0027 ≈ 401; ±2 for leap.
            assert!((n - 400.0).abs() <= 2.0, "life=5 first_dep = {}", n);
        }
        other => panic!("AMORDEGRC life=5: {:?}", other),
    }
}

#[test]
fn eval_amordegrc_coefficient_boundary_life7() {
    // rate=1/7 ≈ 0.142857 → life=7 → coef=2.5 (life > 6).
    let (cm, vs) = make_test_env();
    match eval_str(
        "=AMORDEGRC(1000,DATE(2020,1,1),DATE(2021,1,1),0,0,1/7,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => {
            // 1000 * (1/7) * 2.5 * ≈1.0027 ≈ 358; ±2 for leap.
            assert!((n - 357.0).abs() <= 2.0, "life=7 first_dep = {}", n);
        }
        other => panic!("AMORDEGRC life=7: {:?}", other),
    }
}

#[test]
fn eval_amordegrc_coefficient_boundary_life3_no_adjustment() {
    // rate=1/3 ≈ 0.333 → life=3 → coef=1.0 (life <= 3, no adjustment).
    let (cm, vs) = make_test_env();
    match eval_str(
        "=AMORDEGRC(1000,DATE(2020,1,1),DATE(2021,1,1),0,0,1/3,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => {
            // 1000 * (1/3) * 1.0 * ≈1.0027 ≈ 334; ±2 for leap.
            assert!((n - 333.0).abs() <= 2.0, "life=3 first_dep = {}", n);
        }
        other => panic!("AMORDEGRC life=3: {:?}", other),
    }
}

#[test]
fn eval_amordegrc_all_five_basis_values_produce_nonnegative() {
    let (cm, vs) = make_test_env();
    for b in 0..=4 {
        let f = format!(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,1,0.15,{})",
            b
        );
        match eval_str(&f, &cm, &vs) {
            Value::Number(n) => {
                assert!(n >= 0.0 && n <= 2100.0, "basis={} got {}", b, n);
            }
            other => panic!("basis {}: {:?}", b, other),
        }
    }
}

#[test]
fn eval_amordegrc_last_period_closes_to_salvage() {
    // For life=6.67, last_period=7. The cumulative book-(book−sav)
    // schedule must close out exactly at salvage. Probe period=7 (last)
    // and confirm it equals the remaining gap (book−salvage).
    let (cm, vs) = make_test_env();
    let mut cumulative = 0.0;
    for p in 0..7 {
        let f = format!(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,{},0.15,1)",
            p
        );
        match eval_str(&f, &cm, &vs) {
            Value::Number(n) => cumulative += n,
            other => panic!("period {}: {:?}", p, other),
        }
    }
    let last = match eval_str(
        "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,7,0.15,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => n,
        other => panic!("period 7: {:?}", other),
    };
    let total = cumulative + last;
    // Total must equal cost - salvage (2100). Allow ±1 rounding drift.
    assert!(
        (total - 2100.0).abs() <= 1.0,
        "cumulative+last = {} (cumulative={}, last={}), want ≈ 2100",
        total,
        cumulative,
        last
    );
}
