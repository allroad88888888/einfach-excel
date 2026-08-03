//! IMSUM/IMSUB/IMPRODUCT/IMDIV 与模长辐角访问器。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_imabs_happy() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=IMABS(\"3+4i\")", &cm, &vs), Value::Number(5.0));
    assert_eq!(eval_str("=IMABS(\"5\")", &cm, &vs), Value::Number(5.0));
    // Argument count.
    assert_eq!(
        eval_str("=IMABS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Garbage text.
    assert_eq!(
        eval_str("=IMABS(\"abc\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_imreal_imag_accessors() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=IMREAL(\"3+4i\")", &cm, &vs), Value::Number(3.0));
    assert_eq!(
        eval_str("=IMAGINARY(\"3+4i\")", &cm, &vs),
        Value::Number(4.0)
    );
    // Pure imaginary, no coefficient.
    assert_eq!(eval_str("=IMREAL(\"-i\")", &cm, &vs), Value::Number(0.0));
    assert_eq!(
        eval_str("=IMAGINARY(\"-i\")", &cm, &vs),
        Value::Number(-1.0)
    );
}

#[test]
fn eval_imconjugate() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=IMCONJUGATE(\"3+4i\")", &cm, &vs),
        Value::Text("3-4i".into())
    );
    assert_eq!(
        eval_str("=IMCONJUGATE(\"5-2j\")", &cm, &vs),
        Value::Text("5+2j".into())
    );
    // Real input: imag is 0 → no flip visible.
    assert_eq!(
        eval_str("=IMCONJUGATE(\"7\")", &cm, &vs),
        Value::Text("7".into())
    );
}

#[test]
fn eval_imargument() {
    let (cm, vs) = make_test_env();
    // arg(1+i) = π/4
    match eval_str("=IMARGUMENT(\"1+i\")", &cm, &vs) {
        Value::Number(n) => assert!((n - std::f64::consts::FRAC_PI_4).abs() < 1e-12),
        other => panic!("expected number, got {:?}", other),
    }
    // arg(0) is undefined → #DIV/0!
    assert_eq!(
        eval_str("=IMARGUMENT(\"0\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_imsum_basic() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=IMSUM(\"3+4i\",\"1+2i\")", &cm, &vs),
        Value::Text("4+6i".into())
    );
    // Variadic.
    assert_eq!(
        eval_str("=IMSUM(\"3+4i\",\"1+2i\",\"1-i\")", &cm, &vs),
        Value::Text("5+5i".into())
    );
    // Arg count.
    assert_eq!(
        eval_str("=IMSUM()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_imsum_mixed_suffix_coerces_to_first() {
    let (cm, vs) = make_test_env();
    // Mixed suffix: the first arg's suffix wins; the `j` in the
    // second arg is read as the same imaginary unit.
    assert_eq!(
        eval_str("=IMSUM(\"3+4i\",\"1+2j\")", &cm, &vs),
        Value::Text("4+6i".into())
    );
}

#[test]
fn eval_imsub_basic() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=IMSUB(\"3+4i\",\"1+2i\")", &cm, &vs),
        Value::Text("2+2i".into())
    );
    assert_eq!(
        eval_str("=IMSUB(\"3+4i\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_improduct_basic() {
    let (cm, vs) = make_test_env();
    // (2+3i)(4+5i) = (8-15) + (10+12)i = -7 + 22i
    assert_eq!(
        eval_str("=IMPRODUCT(\"2+3i\",\"4+5i\")", &cm, &vs),
        Value::Text("-7+22i".into())
    );
    // 3 args.
    assert_eq!(
        eval_str("=IMPRODUCT(\"1+i\",\"1+i\",\"1+i\")", &cm, &vs),
        Value::Text("-2+2i".into())
    );
}

#[test]
fn eval_imdiv_basic_and_div_by_zero() {
    let (cm, vs) = make_test_env();
    // (4+2i)/(1+i) = ((4+2) + (2-4)i)/2 = 3 - i
    assert_eq!(
        eval_str("=IMDIV(\"4+2i\",\"1+i\")", &cm, &vs),
        Value::Text("3-i".into())
    );
    // Denominator zero.
    assert_eq!(
        eval_str("=IMDIV(\"3+4i\",\"0\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
