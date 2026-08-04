//! DSUM/DAVERAGE/DPRODUCT 的条件区求和类聚合。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::db_env::*;

#[test]
fn eval_dsum() {
    let (cm, vs) = make_db_env();
    // Salary sum over (Eng AND Age>28) → 80000 + 95000 = 175000.
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(175000.0)
    );
    // Field as 1-based number: Salary is column 4 → same result.
    assert_eq!(
        eval_str("=DSUM(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(175000.0)
    );
    // Empty match set: a criteria of Dept="Marketing" → 0 numerics → 0.
    let (mut cm2, mut vs2) = make_db_env();
    // Overwrite criteria F1:G2 with Dept="Marketing" (single column).
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    // Empty the Age column criterion (G2) so only the Dept filter applies.
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field name → InvalidValue.
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count error.
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Salary\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wildcard: Name="A*" → Alice only → 80000.
    let (mut cm3, mut vs3) = make_db_env();
    let h = AtomId::from_raw(900);
    cm3.insert(CellAddress::new(0, 5), h);
    vs3.insert(h, Value::Text("Name".into()));
    let c = AtomId::from_raw(901);
    cm3.insert(CellAddress::new(1, 5), c);
    vs3.insert(c, Value::Text("A*".into()));
    // Empty G column so only the Name criterion applies.
    let empty_g1 = AtomId::from_raw(902);
    cm3.insert(CellAddress::new(0, 6), empty_g1);
    vs3.insert(empty_g1, Value::Null);
    let empty_g2 = AtomId::from_raw(903);
    cm3.insert(CellAddress::new(1, 6), empty_g2);
    vs3.insert(empty_g2, Value::Null);
    assert_eq!(
        eval_str("=DSUM(A1:D5,\"Salary\",F1:G2)", &cm3, &vs3),
        Value::Number(80000.0)
    );
}

#[test]
fn eval_daverage() {
    let (cm, vs) = make_db_env();
    // (80000 + 95000) / 2 = 87500.
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(87500.0)
    );
    // Field as 1-based number.
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(87500.0)
    );
    // Empty match → DivisionByZero.
    let (mut cm2, mut vs2) = make_db_env();
    let id = AtomId::from_raw(999);
    cm2.insert(CellAddress::new(1, 5), id);
    vs2.insert(id, Value::Text("Marketing".into()));
    let id2 = AtomId::from_raw(998);
    cm2.insert(CellAddress::new(1, 6), id2);
    vs2.insert(id2, Value::Null);
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Error(ValueError::DivisionByZero)
    );
    // Bad field name.
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,\"Salary\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation: database cell holds an Error.
    let (mut cm3, mut vs3) = make_db_env();
    // Overwrite Alice's salary (cell D2 → row=1, col=3) with an Error.
    let err_id = AtomId::from_raw(950);
    cm3.insert(CellAddress::new(1, 3), err_id);
    vs3.insert(err_id, Value::Error(ValueError::DivisionByZero));
    assert_eq!(
        eval_str("=DAVERAGE(A1:D5,\"Salary\",F1:G2)", &cm3, &vs3),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_dproduct() {
    let (cm, vs) = make_db_env();
    // 80000 * 95000 = 7_600_000_000.
    assert_eq!(
        eval_str("=DPRODUCT(A1:D5,\"Salary\",F1:G2)", &cm, &vs),
        Value::Number(7_600_000_000.0)
    );
    // 1-based field.
    assert_eq!(
        eval_str("=DPRODUCT(A1:D5,4,F1:G2)", &cm, &vs),
        Value::Number(7_600_000_000.0)
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
        eval_str("=DPRODUCT(A1:D5,\"Salary\",F1:G2)", &cm2, &vs2),
        Value::Number(0.0)
    );
    // Bad field.
    assert_eq!(
        eval_str("=DPRODUCT(A1:D5,\"Bogus\",F1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DPRODUCT(A1:D5,\"Salary\",F1:G2,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
