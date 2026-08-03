//! DSTDEV/DSTDEVP/DVAR/DVARP 的条件区离散度。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::db_env::*;

#[test]
fn eval_dstdev() {
    let (cm, vs) = make_db_env();
    // Sample stddev of {80000, 95000} → sqrt(((80000-87500)^2 +
    // (95000-87500)^2) / (2-1)) = sqrt(112_500_000) ≈ 10606.6017.
    let v = eval_str("=DSTDEV(A1:D5,\"Salary\",F1:G2)", &cm, &vs);
    match v {
        Value::Number(n) => assert!((n - 112_500_000.0_f64.sqrt()).abs() < 1e-6, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
    // 1-based field.
    let v2 = eval_str("=DSTDEV(A1:D5,4,F1:G2)", &cm, &vs);
    match v2 {
        Value::Number(n) => assert!((n - 112_500_000.0_f64.sqrt()).abs() < 1e-6),
        other => panic!("expected number, got {other:?}"),
    }
    // < 2 matches → DivisionByZero. Narrow to Dave only.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Sales".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Text(">26".into()));
    assert_eq!(
        eval_str("=DSTDEV(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Error(ValueError::DivisionByZero)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DSTDEV(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DSTDEV(A1:D5,\"Salary\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dstdevp() {
    let (cm, vs) = make_db_env();
    // Population stddev of {80000, 95000} → sqrt(((80000-87500)^2 +
    // (95000-87500)^2) / 2) = sqrt(56_250_000) = 7500.
    assert_eq!(
        eval_str("=DSTDEVP(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(7500.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DSTDEVP(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(7500.0)
    );
    // 0 matches → DivisionByZero.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DSTDEVP(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Error(ValueError::DivisionByZero)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DSTDEVP(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DSTDEVP(A1:D5,\"Salary\",F1:G2,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dvar() {
    let (cm, vs) = make_db_env();
    // Sample variance of {80000, 95000} = 112_500_000.
    assert_eq!(
        eval_str("=DVAR(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(112_500_000.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DVAR(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(112_500_000.0)
    );
    // < 2 matches → DivisionByZero.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Sales".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Text(">26".into()));
    assert_eq!(
        eval_str("=DVAR(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Error(ValueError::DivisionByZero)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DVAR(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DVAR(A1:D5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dvarp() {
    let (cm, vs) = make_db_env();
    // Population variance of {80000, 95000} = 56_250_000.
    assert_eq!(
        eval_str("=DVARP(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(56_250_000.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DVARP(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(56_250_000.0)
    );
    // 0 matches → DivisionByZero.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DVARP(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Error(ValueError::DivisionByZero)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DVARP(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DVARP(A1:D5,\"Salary\",F1:G2,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
