//! EFFECT/NOMINAL/PDURATION/RRI/FVSCHEDULE 的利率与期数换算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_effect_happy_path() {
    let (cm, vs) = make_test_env();
    // EFFECT(0.05, 4) = (1 + 0.05/4)^4 - 1 ≈ 0.0509453369140625.
    match eval_str("=EFFECT(0.05,4)", &cm, &vs) {
        Value::Number(n) => {
            assert!(approx(n, 0.050945337, 1e-7), "EFFECT got {}", n)
        }
        other => panic!("EFFECT: {:?}", other),
    }
}

#[test]
fn eval_effect_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=EFFECT(0.05)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_effect_invalid_npery() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=EFFECT(0.05,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Negative nominal rate → Overflow.
    assert_eq!(
        eval_str("=EFFECT(-0.05,4)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_effect_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=EFFECT(B2,4)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_nominal_happy_path_round_trip() {
    let (cm, vs) = make_test_env();
    // NOMINAL is the inverse of EFFECT.
    // NOMINAL(EFFECT(0.05, 4), 4) ≈ 0.05.
    let eff = match eval_str("=EFFECT(0.05,4)", &cm, &vs) {
        Value::Number(n) => n,
        _ => unreachable!(),
    };
    let formula = format!("=NOMINAL({},4)", eff);
    match eval_str(&formula, &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.05, 1e-7), "NOMINAL got {}", n),
        other => panic!("NOMINAL: {:?}", other),
    }
}

#[test]
fn eval_nominal_invalid_npery() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=NOMINAL(0.05,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_nominal_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=NOMINAL(0.05)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

// PDURATION / RRI / FVSCHEDULE
#[test]
fn eval_pduration_basic() {
    // log(2000/1000) / log(1.05) ≈ 14.2067.
    assert_approx_eq(ev("=PDURATION(0.05,1000,2000)"), 14.20669908, 1e-6);
}

#[test]
fn eval_pduration_zero_rate() {
    assert_eq!(
        ev("=PDURATION(0,1000,2000)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_pduration_negative_pv() {
    assert_eq!(
        ev("=PDURATION(0.05,-1000,2000)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_rri_basic() {
    // (2000/1000)^(1/10) - 1 ≈ 0.07177346.
    assert_approx_eq(ev("=RRI(10,1000,2000)"), 0.0717734625, 1e-6);
}

#[test]
fn eval_rri_inverts_pduration() {
    // RRI(PDURATION(0.05, 1000, 2000), 1000, 2000) should land back near 0.05.
    match ev("=RRI(PDURATION(0.05,1000,2000),1000,2000)") {
        Value::Number(n) => assert!((n - 0.05).abs() < 1e-6, "RRI round trip {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_rri_zero_nper_is_error() {
    assert_eq!(ev("=RRI(0,1000,2000)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_fvschedule_constants() {
    // 1000 * 1.05 * 1.06 * 1.07 = 1190.91.
    assert_approx_eq(ev("=FVSCHEDULE(1000,{0.05;0.06;0.07})"), 1190.91, 1e-2);
}

#[test]
fn eval_fvschedule_range() {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let a2 = AtomId::from_raw(1);
    let a3 = AtomId::from_raw(2);
    cm.insert(CellAddress::new(0, 0), a1);
    cm.insert(CellAddress::new(1, 0), a2);
    cm.insert(CellAddress::new(2, 0), a3);
    vs.insert(a1, Value::Number(0.05));
    vs.insert(a2, Value::Number(0.06));
    vs.insert(a3, Value::Number(0.07));
    match eval_str("=FVSCHEDULE(1000,A1:A3)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1190.91).abs() < 1e-2, "FVSCHEDULE got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_fvschedule_wrong_arg_count() {
    assert_eq!(
        ev("=FVSCHEDULE(1000)"),
        Value::Error(ValueError::WrongArgCount)
    );
}
