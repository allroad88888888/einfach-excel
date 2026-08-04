//! DMAX/DMIN 的条件区极值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::db_env::*;

#[test]
fn eval_dmax() {
    let (cm, vs) = make_db_env();
    // max(80000, 95000) = 95000.
    assert_eq!(
        eval_str("=DMAX(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(95000.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DMAX(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(95000.0)
    );
    // Empty match → 0 (Excel parity).
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DMAX(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DMAX(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DMAX(A1:D5,\"Salary\",F1:G2,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dmin() {
    let (cm, vs) = make_db_env();
    // min(80000, 95000) = 80000.
    assert_eq!(
        eval_str("=DMIN(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(80000.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DMIN(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(80000.0)
    );
    // Empty match → 0.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DMIN(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DMIN(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DMIN(A1:D5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
