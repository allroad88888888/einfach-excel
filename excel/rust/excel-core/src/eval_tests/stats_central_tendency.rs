//! AVERAGEA/MODE/MAXA/MINA/GEOMEAN/HARMEAN/TRIMMEAN 的集中趋势。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- AVERAGEA ---

#[test]
fn eval_averagea_happy_path() {
    let (cm, vs) = make_stat_env();
    // D1=TRUE(1) + D2=FALSE(0) + D3="hello"(0) + D4=Null(skip) + D5=5(5)
    // → total = 6, count = 4 → 1.5.
    assert_eq!(eval_str("=AVERAGEA(D1:D5)", &cm, &vs), Value::Number(1.5));
    // Numbers only: A1..A5 = 2,4,6,8,10 → mean 6.
    assert_eq!(eval_str("=AVERAGEA(A1:A5)", &cm, &vs), Value::Number(6.0));
}

#[test]
fn eval_averagea_empty_is_div_zero() {
    let (cm, vs) = make_stat_env();
    // Empty (no args) → WrongArgCount? No — variadic, but no values → DivisionByZero.
    // We use a range pointing at an empty area.
    assert_eq!(
        eval_str("=AVERAGEA(Z1:Z5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_averagea_error_propagates() {
    let (cm, vs) = make_stat_env();
    // A1/Z1 → A1=2, Z1=0 (Null coerces to 0) → DivisionByZero.
    assert_eq!(
        eval_str("=AVERAGEA(A1/Z1,A2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_geomean_simple() {
    // geomean(2, 8) = sqrt(16) = 4.
    assert_approx_eq(ev("=GEOMEAN(2, 8)"), 4.0, TOL);
}

#[test]
fn eval_geomean_negative_is_error() {
    assert_eq!(ev("=GEOMEAN(1, -1, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_geomean_zero_is_error() {
    assert_eq!(ev("=GEOMEAN(1, 0, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_harmean_simple() {
    // harmean(1, 2, 4) = 3 / (1 + 0.5 + 0.25) = 3 / 1.75 ≈ 1.714286.
    assert_approx_eq(ev("=HARMEAN(1, 2, 4)"), 3.0 / 1.75, TOL);
}

#[test]
fn eval_harmean_negative_is_error() {
    assert_eq!(ev("=HARMEAN(1, -1, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_trimmean_no_trim() {
    // n=10, percent=0.1 → trim_total=1 → trim_each=0. Mean of all = 5.5.
    // SEQUENCE(10) produces 1..=10 as a 10x1 spill array which TRIMMEAN
    // consumes as its first arg.
    assert_approx_eq(ev("=TRIMMEAN(SEQUENCE(10), 0.1)"), 5.5, TOL);
}

#[test]
fn eval_trimmean_with_trim() {
    // n=10, percent=0.2 → trim_total=2 → trim_each=1. Mean of 2..9 = 5.5.
    assert_approx_eq(ev("=TRIMMEAN(SEQUENCE(10), 0.2)"), 5.5, TOL);
}

#[test]
fn eval_trimmean_percent_out_of_range() {
    assert_eq!(
        ev("=TRIMMEAN(SEQUENCE(3), 1)"),
        Value::Error(ValueError::Overflow)
    );
}

// --- MODE.SNGL / MODE.MULT ---

#[test]
fn mode_sngl_routes_to_mode() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=MODE.SNGL(1, 2, 2, 3)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn mode_mult_returns_all_modes() {
    let (cm, vs) = make_test_env();
    // 2 and 3 both appear twice → both modes.
    let (r, c, data) = unwrap_array(eval_str("=MODE.MULT({1,2,2,3,3,4})", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    // First-occurrence order: 2 appears before 3 in input.
    assert_eq!(data, vec![Value::Number(2.0), Value::Number(3.0)]);
}

#[test]
fn mode_mult_no_repeats_is_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=MODE.MULT({1,2,3,4})", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

// --- MAXA / MINA ---

#[test]
fn maxa_treats_logical_as_one_zero() {
    let (cm, vs) = make_test_env();
    // TRUE = 1, FALSE = 0; -1 < 0 so the TRUE wins.
    assert_eq!(
        eval_str("=MAXA(-1, FALSE, TRUE)", &cm, &vs),
        Value::Number(1.0)
    );
}

#[test]
fn mina_treats_text_as_zero() {
    let (cm, vs) = make_test_env();
    // 5 is the smallest non-text candidate; "hello" counts as 0 → 0 wins.
    assert_eq!(
        eval_str(r#"=MINA(5, 10, "hello")"#, &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn maxa_empty_returns_zero() {
    let (cm, vs) = make_test_env();
    // C1 is 0 in the test env, but a fully-empty range goes to 0.
    // Use a literal of no args to trip the empty path (Excel returns 0).
    // We can synthesize via an unused range; in our env C2 is empty.
    // MAX(C2) → InvalidValue (existing), MAXA(C2) → 0 (Excel parity).
    // The empty-input path is hard to hit purely with literals; use a
    // single empty arg through Null coercion (literal "")=text counts
    // as 0, so check that path too.
    assert_eq!(eval_str(r#"=MAXA("")"#, &cm, &vs), Value::Number(0.0));
}
