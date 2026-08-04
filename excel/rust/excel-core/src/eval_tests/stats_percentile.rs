//! PERCENTILE 的 INC/EXC 分位数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- PERCENTILE ---

#[test]
fn eval_percentile_endpoints_and_middle() {
    let (cm, vs) = make_stat_env();
    // A1..A5 = 2,4,6,8,10 sorted asc.
    // k=0 → min = 2.
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,0)", &cm, &vs),
        Value::Number(2.0)
    );
    // k=1 → max = 10.
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,1)", &cm, &vs),
        Value::Number(10.0)
    );
    // k=0.5 → median = 6.
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,0.5)", &cm, &vs),
        Value::Number(6.0)
    );
    // k=0.25 → pos = 1.0 → exact index 1 → value 4.
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,0.25)", &cm, &vs),
        Value::Number(4.0)
    );
}

#[test]
fn eval_percentile_interpolation() {
    let (cm, vs) = make_stat_env();
    // A1..A5 sorted = 2,4,6,8,10. k=0.1 → pos = 0.4 → interp 2 + (4-2)*0.4 = 2.8.
    match eval_str("=PERCENTILE(A1:A5,0.1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 2.8).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_percentile_k_out_of_range() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,-0.1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,1.5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_percentile_empty_range() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=PERCENTILE(Z1:Z5,0.5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_percentile_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_percentile_type_error() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=PERCENTILE(A1:A5,\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_percentile_inc_dotted() {
    let (cm, vs) = make_stat_env();
    // PERCENTILE.INC is the same function as PERCENTILE.
    assert_eq!(
        eval_str("=PERCENTILE.INC(A1:A5,0.5)", &cm, &vs),
        Value::Number(6.0),
    );
    assert_eq!(
        eval_str("=PERCENTILE.INC(A1:A5,0.5)", &cm, &vs),
        eval_str("=PERCENTILE(A1:A5,0.5)", &cm, &vs),
    );
    assert_eq!(
        eval_str("=PERCENTILE.INC(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

// --- Exclusive percentile / quartile ---

#[test]
fn eval_percentile_exc() {
    let (cm, vs) = make_stat_env();
    // PERCENTILE.EXC(A1:A5, 0.5) on {2,4,6,8,10}: pos = 0.5*(5+1) = 3,
    // i.e. the 3rd sorted value = 6.
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5,0.5)", &cm, &vs),
        Value::Number(6.0),
    );
    // k=0.25 → pos = 1.5 → interp(nums[0]=2, nums[1]=4) at frac 0.5 = 3.
    match eval_str("=PERCENTILE.EXC(A1:A5,0.25)", &cm, &vs) {
        Value::Number(n) => assert!((n - 3.0).abs() < 1e-12, "got {n}"),
        other => panic!("PERCENTILE.EXC(0.25): {other:?}"),
    }
    // k=0 and k=1 are NOT allowed in exclusive mode.
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5,0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5,1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Position out of range (k too small / too large for n=5): pos<1 or pos>n.
    // k=0.1 → pos = 0.6 → <1 → invalid.
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5,0.1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // k=0.9 → pos = 5.4 → >n=5 → invalid.
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5,0.9)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=PERCENTILE.EXC(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

// --- PERCENTILE.INC (alias to PERCENTILE) ---
// The bare `PERCENTILE` / `PERCENTILE.INC` arm was already present
// in the dispatcher (`percentile_impl`); the Q batch just registers
// both names. These three tests verify the alias works end-to-end.

#[test]
fn percentile_inc_alias_works() {
    let (cm, vs) = make_test_env();
    // [1,2,3,4,5] k=0.5 → 3 (median).
    assert_eq!(
        eval_str("=PERCENTILE.INC({1,2,3,4,5}, 0.5)", &cm, &vs),
        Value::Number(3.0)
    );
    assert_eq!(
        eval_str("=PERCENTILE({1,2,3,4,5}, 0.5)", &cm, &vs),
        Value::Number(3.0)
    );
}

#[test]
fn percentile_inc_interpolates_fractional_k() {
    let (cm, vs) = make_test_env();
    // [1,2,3,4,5] k=0.25 → 2.0 (Excel: linear interp at pos = 0.25*4 = 1).
    // pos=1 → index 1 directly → value 2.
    match eval_str("=PERCENTILE.INC({1,2,3,4,5}, 0.25)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 2.0, 1e-9), "PERCENTILE.INC k=0.25 = {}", n),
        other => panic!("{:?}", other),
    }
    // [10,20,30,40] k=0.4 → pos = 0.4*3 = 1.2 → between idx 1 (20) and
    // idx 2 (30); 20 + (30-20)*0.2 = 22.
    match eval_str("=PERCENTILE.INC({10,20,30,40}, 0.4)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 22.0, 1e-9), "PERCENTILE.INC k=0.4 = {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn percentile_inc_rejects_bad_k() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PERCENTILE.INC({1,2,3}, 1.5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=PERCENTILE.INC({1,2,3}, -0.1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
