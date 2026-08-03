//! IMEXP/IMLN/IMSQRT/IMPOWER 与复三角函数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::complex_support::*;

#[test]
fn eval_imexp_basic() {
    let (cm, vs) = make_test_env();
    // exp(0+pi*i) = -1 + 0i. We seed pi through a real cell as text isn't
    // available; use a literal.
    let pi = std::f64::consts::PI;
    let formula = format!("=IMEXP(\"0+{}i\")", pi);
    let v = eval_str(&formula, &cm, &vs);
    assert_complex_near(v, -1.0, 0.0, 1e-12);
    // exp(1+0i) = e
    assert_complex_near(
        eval_str("=IMEXP(\"1\")", &cm, &vs),
        std::f64::consts::E,
        0.0,
        1e-12,
    );
}

#[test]
fn eval_imln_imlog10_imlog2() {
    let (cm, vs) = make_test_env();
    // ln(e+0i) = 1
    let e = std::f64::consts::E;
    let formula = format!("=IMLN(\"{}\")", e);
    assert_complex_near(eval_str(&formula, &cm, &vs), 1.0, 0.0, 1e-12);
    // log10(100) = 2
    assert_complex_near(eval_str("=IMLOG10(\"100\")", &cm, &vs), 2.0, 0.0, 1e-12);
    // log2(8) = 3
    assert_complex_near(eval_str("=IMLOG2(\"8\")", &cm, &vs), 3.0, 0.0, 1e-12);
    // ln(0) is #NUM!
    assert_eq!(
        eval_str("=IMLN(\"0\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_imsqrt_principal() {
    let (cm, vs) = make_test_env();
    // sqrt(4) = 2 (real positive, no imag)
    assert_eq!(
        eval_str("=IMSQRT(\"4\")", &cm, &vs),
        Value::Text("2".into())
    );
    // sqrt(-1) = i (pure imaginary)
    assert_complex_near(eval_str("=IMSQRT(\"-1\")", &cm, &vs), 0.0, 1.0, 1e-12);
    // sqrt(0) = 0
    assert_eq!(
        eval_str("=IMSQRT(\"0\")", &cm, &vs),
        Value::Text("0".into())
    );
}

#[test]
fn eval_impower_de_moivre() {
    let (cm, vs) = make_test_env();
    // (1+i)^2 = 2i
    assert_complex_near(eval_str("=IMPOWER(\"1+i\",2)", &cm, &vs), 0.0, 2.0, 1e-12);
    // i^4 = 1
    assert_complex_near(eval_str("=IMPOWER(\"i\",4)", &cm, &vs), 1.0, 0.0, 1e-12);
    // 0^0 = 1 (matches POWER).
    assert_eq!(
        eval_str("=IMPOWER(\"0\",0)", &cm, &vs),
        Value::Text("1".into())
    );
    // 0^-1 = #NUM!
    assert_eq!(
        eval_str("=IMPOWER(\"0\",-1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_imcos_imsin_real_axis() {
    let (cm, vs) = make_test_env();
    // cos(0) = 1, sin(0) = 0 along the real axis.
    assert_complex_near(eval_str("=IMCOS(\"0\")", &cm, &vs), 1.0, 0.0, 1e-12);
    assert_complex_near(eval_str("=IMSIN(\"0\")", &cm, &vs), 0.0, 0.0, 1e-12);
    // cos(pi) = -1.
    let pi = std::f64::consts::PI;
    let formula = format!("=IMCOS(\"{}\")", pi);
    assert_complex_near(eval_str(&formula, &cm, &vs), -1.0, 0.0, 1e-12);
}

#[test]
fn eval_imcosh_imsinh_real_axis() {
    let (cm, vs) = make_test_env();
    // cosh(0) = 1, sinh(0) = 0.
    assert_complex_near(eval_str("=IMCOSH(\"0\")", &cm, &vs), 1.0, 0.0, 1e-12);
    assert_complex_near(eval_str("=IMSINH(\"0\")", &cm, &vs), 0.0, 0.0, 1e-12);
}

#[test]
fn eval_imtan_imsec_imcsc_imcot() {
    let (cm, vs) = make_test_env();
    // tan(0) = 0, sec(0) = 1, cot is undefined at 0 (sin=0).
    assert_complex_near(eval_str("=IMTAN(\"0\")", &cm, &vs), 0.0, 0.0, 1e-12);
    assert_complex_near(eval_str("=IMSEC(\"0\")", &cm, &vs), 1.0, 0.0, 1e-12);
    assert_eq!(
        eval_str("=IMCOT(\"0\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=IMCSC(\"0\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
