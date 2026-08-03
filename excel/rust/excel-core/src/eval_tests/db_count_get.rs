//! DCOUNT/DCOUNTA/DGET 的条件区计数与取值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::db_env::*;

#[test]
fn eval_dcount() {
    let (cm, vs) = make_db_env();
    // Count numeric Salary values in matches → 2.
    assert_eq!(
        eval_str("=DCOUNT(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(2.0)
    );
    // Field as number.
    assert_eq!(
        eval_str("=DCOUNT(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(2.0)
    );
    // Counting the Name column (Text) → 0 numerics among matches.
    assert_eq!(
        eval_str("=DCOUNT(A1:D5,\"Name\",F1:G2)", &cm, &vs),
        Value::Number(0.0)
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
        eval_str("=DCOUNT(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DCOUNT(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DCOUNT(A1:D5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dcounta() {
    let (cm, vs) = make_db_env();
    // 2 matches; Name column has 2 non-empty text cells.
    assert_eq!(
        eval_str("=DCOUNTA(A1:D5,\"Name\",F1:G2)", &cm, &vs),
        Value::Number(2.0)
    );
    // Numeric column also returns 2 (both non-Null).
    assert_eq!(
        eval_str("=DCOUNTA(A1:D5,2,F1:G2)", &cm, &vs),
        Value::Number(2.0)
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
        eval_str("=DCOUNTA(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DCOUNTA(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DCOUNTA(A1:D5,\"Name\",F1:G2,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dget() {
    let (cm, vs) = make_db_env();
    // Two matches → Overflow (#NUM!).
    assert_eq!(
        eval_str("=DGET(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Single match: filter narrower (Dept="Sales", Age>26 → only Dave).
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Sales".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Text(">26".into()));
    assert_eq!(
        eval_str("=DGET(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(70000.0)
    );
    // Same single match by 1-based field.
    assert_eq!(
        eval_str("=DGET(A1:D5,4,F1:G2)", &cm2, &vs2),
        Value::Number(70000.0)
    );
    // No matches → InvalidValue.
    let (mut cm3, mut vs3) = make_db_env();
    let id = AtomId::from_raw(999);
    cm3.insert(CellAddress::new(1, 5), id);
    vs3.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm3.insert(CellAddress::new(1, 6), id2);
    vs3.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DGET(A1:D5,\"Salary\",F1:G2)", &cm3, &vs3),
        Value::Error(ValueError::InvalidValue)
    );
    // Bad field → InvalidValue.
    assert_eq!(
        eval_str("=DGET(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DGET(A1:D5,\"Salary\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
