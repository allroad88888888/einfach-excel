//! DB/DDB/VDB 的余额递减折旧。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_db_happy_path() {
    let (cm, vs) = make_test_env();
    // DB(1000000, 100000, 6, 1, 7) ≈ 186083.33 per Excel reference.
    match eval_str("=DB(1000000,100000,6,1,7)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 186083.33, 1e-2), "DB(...,1,7) got {}", n),
        other => panic!("DB(...,1,7): {:?}", other),
    }
    // DB(1000000, 100000, 6, 2, 7) ≈ 259639.42.
    match eval_str("=DB(1000000,100000,6,2,7)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 259639.42, 1e-2), "DB(...,2,7) got {}", n),
        other => panic!("DB(...,2,7): {:?}", other),
    }
    // DB with default month=12: DB(10000, 1000, 5, 1) — simpler check
    // that just confirms it's finite and rate is positive.
    match eval_str("=DB(10000,1000,5,1)", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.0 && n < 10000.0, "DB default-month got {}", n),
        other => panic!("DB default-month: {:?}", other),
    }
}

#[test]
fn eval_db_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DB(10000,1000,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_db_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DB(B2,1000,5,1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_db_invalid_life() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DB(10000,1000,0,1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=DB(10000,1000,5,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_ddb_happy_path() {
    let (cm, vs) = make_test_env();
    // DDB(10000, 1000, 5, 1) = min(10000 * 2/5, 9000) = min(4000, 9000) = 4000.
    assert_eq!(
        eval_str("=DDB(10000,1000,5,1)", &cm, &vs),
        Value::Number(4000.0)
    );
    // DDB(10000, 1000, 5, 2) = (10000-4000) * 0.4 = 2400.
    assert_eq!(
        eval_str("=DDB(10000,1000,5,2)", &cm, &vs),
        Value::Number(2400.0)
    );
    // Final period clamps at (cost - salvage - prior). DDB(10000, 1000, 5, 5):
    // dep1=4000, dep2=2400, dep3=1440, dep4=864, prior=8704;
    // ddb5 = (10000-8704)*0.4 = 518.4, clamp at 9000-8704 = 296 → 296.
    match eval_str("=DDB(10000,1000,5,5)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 296.0, 1e-2), "DDB(5,5) got {}", n),
        other => panic!("DDB(5,5): {:?}", other),
    }
}

#[test]
fn eval_ddb_factor_3() {
    let (cm, vs) = make_test_env();
    // DDB(10000, 1000, 5, 1, 3) = 10000*3/5 = 6000.
    assert_eq!(
        eval_str("=DDB(10000,1000,5,1,3)", &cm, &vs),
        Value::Number(6000.0)
    );
}

#[test]
fn eval_ddb_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DDB(10000,1000,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_ddb_invalid_period() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DDB(10000,1000,5,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_vdb_no_switch_matches_ddb_sum() {
    let (cm, vs) = make_test_env();
    // VDB(10000, 1000, 5, 0, 1, 2, TRUE) should equal DDB period 1 = 4000.
    assert_eq!(
        eval_str("=VDB(10000,1000,5,0,1,2,TRUE)", &cm, &vs),
        Value::Number(4000.0)
    );
    // VDB across 0..2 no-switch = DDB(1) + DDB(2) = 4000 + 2400 = 6400.
    assert_eq!(
        eval_str("=VDB(10000,1000,5,0,2,2,TRUE)", &cm, &vs),
        Value::Number(6400.0)
    );
}

#[test]
fn eval_vdb_with_switch_total_equals_cost_minus_salvage() {
    let (cm, vs) = make_test_env();
    // VDB across the full life (0..life) with switch enabled should
    // depreciate exactly cost - salvage = 9000.
    match eval_str("=VDB(10000,1000,5,0,5)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 9000.0, 1e-6), "VDB full got {}", n),
        other => panic!("VDB full: {:?}", other),
    }
}

#[test]
fn eval_vdb_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=VDB(10000,1000,5,0)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_vdb_invalid_range() {
    let (cm, vs) = make_test_env();
    // start > end → Overflow.
    assert_eq!(
        eval_str("=VDB(10000,1000,5,3,2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // end > life → Overflow.
    assert_eq!(
        eval_str("=VDB(10000,1000,5,0,6)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
