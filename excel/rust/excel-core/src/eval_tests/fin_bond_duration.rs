//! DURATION/MDURATION 的久期。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_duration_positive() {
    let (cm, vs) = make_test_env();
    // 5-year semi-annual bond: Macaulay duration < life and > 0.
    match eval_str(
        "=DURATION(DATE(2020,1,1),DATE(2025,1,1),0.05,0.05,2,0)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => {
            assert!(n > 0.0 && n < 5.0, "DURATION out of range: {}", n);
        }
        other => panic!("DURATION: {:?}", other),
    }
}

#[test]
fn eval_duration_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DURATION(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_duration_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=DURATION(DATE(2020,1,1),DATE(2025,1,1),B2,0.05,2)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_mduration_less_than_duration() {
    let (cm, vs) = make_test_env();
    // MDURATION = DURATION / (1 + yld/freq), so MDURATION < DURATION
    // when yld > 0.
    match (
        eval_str(
            "=DURATION(DATE(2020,1,1),DATE(2025,1,1),0.05,0.06,2,0)",
            &cm,
            &vs,
        ),
        eval_str(
            "=MDURATION(DATE(2020,1,1),DATE(2025,1,1),0.05,0.06,2,0)",
            &cm,
            &vs,
        ),
    ) {
        (Value::Number(d), Value::Number(m)) => {
            assert!(m > 0.0 && m < d, "MDURATION {} >= DURATION {}", m, d);
        }
        other => panic!("DUR/MDUR: {:?}", other),
    }
}

#[test]
fn eval_mduration_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=MDURATION()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
