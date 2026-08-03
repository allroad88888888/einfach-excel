//! NPV/IRR/MIRR/XNPV/XIRR 的现金流贴现。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::fin_annuity_env::*;

#[test]
fn eval_npv() {
    let (cm, vs) = make_test_env();
    let fcm = make_finance_env();
    // Direct args: NPV(0.1, 100, 100, 100) = 100/1.1 + 100/1.21 + 100/1.331 ≈ 248.685.
    match eval_str("=NPV(0.1,100,100,100)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 248.685, 1e-2), "NPV got {}", n),
        other => panic!("NPV: {:?}", other),
    }
    // Range arg with the [-100, 30, 40, 50] flows at A1:A4. NPV
    // discounts the first flow by (1+r), so this equals
    //   -100/1.1 + 30/1.21 + 40/1.331 + 50/1.4641 ≈ -1.9124.
    // The flows include the initial outlay; Excel users would
    // normally write IRR-style sequences without the t=0 outlay
    // inside NPV, but this confirms the discount math.
    match eval_str("=NPV(0.1,A1:A4)", &fcm.0, &fcm.1) {
        Value::Number(n) => assert!(approx(n, -1.9124, 1e-3), "NPV range got {}", n),
        other => panic!("NPV range: {:?}", other),
    }
    // Empty range (D1:D3 — no entries in env) → 0 with no error.
    assert_eq!(
        eval_str("=NPV(0.1,D1:D3)", &fcm.0, &fcm.1),
        Value::Number(0.0)
    );
    // Arg-count error (only rate, no flows).
    assert_eq!(
        eval_str("=NPV(0.1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=NPV(A1/C1,100)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_irr() {
    let (cm, vs) = make_finance_env();
    // [-100, 30, 40, 50] → IRR ≈ 0.08896.
    match eval_str("=IRR(A1:A4)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.08896, 1e-4), "IRR got {}", n),
        other => panic!("IRR: {:?}", other),
    }
    // With explicit guess.
    match eval_str("=IRR(A1:A4,0.05)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.08896, 1e-4), "IRR(guess) got {}", n),
        other => panic!("IRR guess: {:?}", other),
    }
    // All-positive cash flows → InvalidValue.
    assert_eq!(
        eval_str("=IRR(C1:C3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=IRR()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Non-range first arg → WrongType.
    assert_eq!(
        eval_str("=IRR(100)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

fn make_xirr_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Cash flows: -100 on Jan 1 2020, +50 on Jun 1 2020, +70 on Dec 31 2020.
    // Verified XIRR ≈ 0.2092.
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let flows = [-100.0_f64, 50.0, 70.0];
    // Date serials under our 1970 epoch.
    // 2020-01-01 = 18262, 2020-06-01 = 18414, 2020-12-31 = 18627.
    let dates = [
        date_serial(2020, 1, 1),
        date_serial(2020, 6, 1),
        date_serial(2020, 12, 31),
    ];
    for (i, v) in flows.iter().enumerate() {
        let id = AtomId::from_raw(300 + i as u64);
        cell_map.insert(CellAddress::new(i as u32, 0), id);
        values.insert(id, Value::Number(*v));
    }
    for (i, d) in dates.iter().enumerate() {
        let id = AtomId::from_raw(310 + i as u64);
        cell_map.insert(CellAddress::new(i as u32, 1), id);
        values.insert(id, Value::Number(*d));
    }
    (cell_map, values)
}

#[test]
fn eval_xirr_known_result() {
    let (cm, vs) = make_xirr_env();
    // [-100, 50, 70] on (2020-01-01, 2020-06-01, 2020-12-31).
    // XIRR solves Σ v_i / (1+r)^((d_i - d_0)/365) = 0:
    //   -100 + 50/(1+r)^0.4164 + 70/(1+r)^1.0 = 0
    // Numerically the root is r ≈ 0.27657. This matches Excel /
    // LibreOffice (the spec hint of "0.21" was a low estimate; the
    // actual mathematical root is closer to 0.277).
    match eval_str("=XIRR(A1:A3,B1:B3)", &cm, &vs) {
        Value::Number(n) => assert!(
            approx(n, 0.27657, 1e-4),
            "XIRR got {} (expected ~0.27657)",
            n
        ),
        other => panic!("XIRR: {:?}", other),
    }
}

#[test]
fn eval_xirr_with_guess() {
    let (cm, vs) = make_xirr_env();
    // Convergence from a different guess should land on the same root.
    match eval_str("=XIRR(A1:A3,B1:B3,0.05)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.27657, 1e-4), "XIRR(guess) got {}", n),
        other => panic!("XIRR(guess): {:?}", other),
    }
}

#[test]
fn eval_xirr_all_positive() {
    let (cm, vs) = make_xirr_env();
    // C1..C3 will be set up by all-positive scenario: just test that
    // an all-positive sequence surfaces InvalidValue. We can synthesize
    // via a literal range — use the env's all-positive C1..C3 region
    // (10, 20, 30) from `make_finance_env`'s convention, but xirr env
    // doesn't have that. Build inline via SUM-like check: skip and use
    // an explicit all-positive 2-element via a constructed range —
    // since we can't easily inline arrays, reuse A2:A3 (both >=50, both
    // positive) and a 2-element date range.
    // A2 = 50, A3 = 70, B2 = 2020-06-01, B3 = 2020-12-31 → all positive.
    assert_eq!(
        eval_str("=XIRR(A2:A3,B2:B3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_xirr_wrong_arg_count() {
    let (cm, vs) = make_xirr_env();
    assert_eq!(
        eval_str("=XIRR(A1:A3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_xirr_shape_mismatch() {
    let (cm, vs) = make_xirr_env();
    // 3 values, 2 dates → shape mismatch.
    assert_eq!(
        eval_str("=XIRR(A1:A3,B1:B2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_xnpv_happy_path() {
    let (cm, vs) = make_xirr_env();
    // XNPV(0.1, A1:A3, B1:B3): manually compute
    // d0=2020-01-01=18262, d1=2020-06-01=18414 (+152 days = 0.4164y),
    // d2=2020-12-31=18627 (+365 days = 1.0y).
    // = -100 + 50/(1.1^0.4164) + 70/(1.1^1.0)
    // ≈ -100 + 50/1.04063 + 70/1.1
    // ≈ -100 + 48.05 + 63.636 ≈ 11.68.
    match eval_str("=XNPV(0.1,A1:A3,B1:B3)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 11.68, 1e-1), "XNPV got {}", n),
        other => panic!("XNPV: {:?}", other),
    }
}

#[test]
fn eval_xnpv_rate_too_low() {
    let (cm, vs) = make_xirr_env();
    assert_eq!(
        eval_str("=XNPV(-1,A1:A3,B1:B3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_xnpv_wrong_arg_count() {
    let (cm, vs) = make_xirr_env();
    assert_eq!(
        eval_str("=XNPV(0.1,A1:A3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_mirr_happy_path() {
    let (cm, vs) = make_finance_env();
    // MIRR([-100, 30, 40, 50], 0.05, 0.1) — manually computed:
    // PV(neg) = -100 (at i=0).
    // FV(pos) = 30*(1.1)^2 + 40*(1.1)^1 + 50*(1.1)^0 = 36.3 + 44 + 50 = 130.3.
    // ratio = -130.3 / -100 = 1.303.
    // MIRR = 1.303^(1/3) - 1 ≈ 0.0921.
    match eval_str("=MIRR(A1:A4,0.05,0.1)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.0921, 1e-3), "MIRR got {}", n),
        other => panic!("MIRR: {:?}", other),
    }
}

#[test]
fn eval_mirr_all_positive_div_by_zero() {
    let (cm, vs) = make_finance_env();
    // C1..C3 = [10, 20, 30] from make_finance_env.
    assert_eq!(
        eval_str("=MIRR(C1:C3,0.05,0.1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_mirr_wrong_arg_count() {
    let (cm, vs) = make_finance_env();
    assert_eq!(
        eval_str("=MIRR(A1:A4,0.05)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_mirr_type_error() {
    let (cm, vs) = make_finance_env();
    assert_eq!(
        eval_str("=MIRR(A1:A4,B1,0.1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
