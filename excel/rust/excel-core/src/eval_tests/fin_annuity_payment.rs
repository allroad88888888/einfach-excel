//! PMT/PV/FV/NPER/RATE 的等额年金五参数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_pmt() {
    let (cm, vs) = make_test_env();
    // 30-year fixed-rate loan: rate=0.005/mo, nper=360, pv=200000.
    // Excel PMT ≈ -1199.10.
    match eval_str("=PMT(0.005,360,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -1199.10, 1e-2), "PMT got {}", n),
        other => panic!("PMT: {:?}", other),
    }
    // rate=0 linear branch: PMT(0, 10, 1000) = -100.
    assert_eq!(eval_str("=PMT(0,10,1000)", &cm, &vs), Value::Number(-100.0));
    // type=1 produces a smaller (less-negative) payment than type=0
    // because each pmt accrues an extra period of interest.
    let p0 = match eval_str("=PMT(0.005,360,200000,0,0)", &cm, &vs) {
        Value::Number(n) => n,
        _ => unreachable!(),
    };
    let p1 = match eval_str("=PMT(0.005,360,200000,0,1)", &cm, &vs) {
        Value::Number(n) => n,
        _ => unreachable!(),
    };
    assert!(p1 > p0, "type=1 pmt {} should be > type=0 pmt {}", p1, p0);
    // Arg-count error.
    assert_eq!(
        eval_str("=PMT(0.005,360)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=PMT(0.005,360,200000,0,0,0)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error: B2 is text.
    assert_eq!(
        eval_str("=PMT(B2,360,200000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation: A1/C1 in args propagates DivisionByZero.
    assert_eq!(
        eval_str("=PMT(A1/C1,360,200000)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // Invalid type value.
    assert_eq!(
        eval_str("=PMT(0.005,360,200000,0,2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_pv() {
    let (cm, vs) = make_test_env();
    // From PMT above: PV(0.005, 360, -1199.10) ≈ 200000. The PMT
    // figure is rounded to 2 decimals so back-computed PV is off by
    // ~0.2; tolerance accommodates that round-trip error.
    match eval_str("=PV(0.005,360,-1199.10)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 200000.0, 1.0), "PV got {}", n),
        other => panic!("PV: {:?}", other),
    }
    // rate=0 linear: PV(0, 10, -100, 0) = -(-100*10 + 0) = 1000.
    assert_eq!(eval_str("=PV(0,10,-100)", &cm, &vs), Value::Number(1000.0));
    assert_eq!(
        eval_str("=PV(0.005)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=PV(B2,360,-1199.10)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_fv() {
    let (cm, vs) = make_test_env();
    // Saving $100/mo at 0.5%/mo for 60 months from a $0 start: Excel
    // FV ≈ -6977.00 (negative because pmt is positive → outflow).
    match eval_str("=FV(0.005,60,-100,0,0)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 6977.00, 1e-1), "FV got {}", n),
        other => panic!("FV: {:?}", other),
    }
    // rate=0 linear: FV(0, 10, -100, 0) = -(0 + -100*10) = 1000.
    assert_eq!(eval_str("=FV(0,10,-100)", &cm, &vs), Value::Number(1000.0));
    // pv=1000 included: FV(0, 10, -100, 1000) = -(1000 + -1000) = 0.
    // Value::PartialEq compares f64 by to_bits so `-0.0 != 0.0`; we
    // accept either sign for the zero result via an approx check.
    match eval_str("=FV(0,10,-100,1000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.0, 1e-9), "FV(0,...,1000) got {}", n),
        other => panic!("FV(0,...,1000): {:?}", other),
    }
    assert_eq!(
        eval_str("=FV()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=FV(B2,60,-100)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_nper() {
    let (cm, vs) = make_test_env();
    // NPER(0.005, -1199.10, 200000) ≈ 360.
    match eval_str("=NPER(0.005,-1199.10,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 360.0, 1e-2), "NPER got {}", n),
        other => panic!("NPER: {:?}", other),
    }
    // rate=0: NPER(0, -100, 1000) = -(1000+0)/-100 = 10.
    assert_eq!(
        eval_str("=NPER(0,-100,1000)", &cm, &vs),
        Value::Number(10.0)
    );
    // rate=0 and pmt=0 → #DIV/0!.
    assert_eq!(
        eval_str("=NPER(0,0,1000)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // Log-domain failure: PV=0, PMT=0, FV=100 → no solution.
    assert_eq!(
        eval_str("=NPER(0.05,0,0,100)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=NPER(0.005)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=NPER(B2,-100,1000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_rate() {
    let (cm, vs) = make_test_env();
    // RATE(360, -1199.10, 200000) ≈ 0.005.
    match eval_str("=RATE(360,-1199.10,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.005, 1e-5), "RATE got {}", n),
        other => panic!("RATE: {:?}", other),
    }
    // RATE(10, -100, 600) ≈ 0.10558.
    match eval_str("=RATE(10,-100,600)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.10558, 1e-4), "RATE got {}", n),
        other => panic!("RATE: {:?}", other),
    }
    // Non-convergence: absurd inputs (large pv, large positive pmt with
    // no fv) have no root in the real domain → Overflow.
    assert_eq!(
        eval_str("=RATE(10,1000,1000)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=RATE(10)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error.
    assert_eq!(
        eval_str("=RATE(10,B2,1000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // nper <= 0 → InvalidValue.
    assert_eq!(
        eval_str("=RATE(0,-100,1000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
