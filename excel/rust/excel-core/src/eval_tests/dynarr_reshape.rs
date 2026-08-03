//! TOROW/TOCOL 的降维展平。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_torow_basic_row_major() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(2,3) = [[1,2,3],[4,5,6]]. TOROW flattens to 1×6 row-major.
    let (r, c, data) = unwrap_array(eval_str("=TOROW(SEQUENCE(2, 3))", &cm, &vs));
    assert_eq!((r, c), (1, 6));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
            Value::Number(5.0),
            Value::Number(6.0),
        ]
    );
}

#[test]
fn eval_torow_by_column() {
    let (cm, vs) = make_test_env();
    // Same array, scan_by_column=TRUE → 1,4,2,5,3,6.
    let (r, c, data) = unwrap_array(eval_str("=TOROW(SEQUENCE(2, 3), 0, TRUE)", &cm, &vs));
    assert_eq!((r, c), (1, 6));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(4.0),
            Value::Number(2.0),
            Value::Number(5.0),
            Value::Number(3.0),
            Value::Number(6.0),
        ]
    );
}

#[test]
fn eval_torow_skip_blanks_and_errors() {
    // Build a 1×4 array via cells: [1, null, error, 4]. Use a literal
    // formula at C1 that produces #DIV/0!, then drive TOROW on A1:D1.
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    // B1 = null (no value entry).
    let b1 = AtomId::from_raw(1);
    let c1 = AtomId::from_raw(2);
    let d1 = AtomId::from_raw(3);
    cm.insert(CellAddress::new(0, 0), a1);
    cm.insert(CellAddress::new(0, 1), b1);
    cm.insert(CellAddress::new(0, 2), c1);
    cm.insert(CellAddress::new(0, 3), d1);
    vs.insert(a1, Value::Number(1.0));
    vs.insert(b1, Value::Null);
    vs.insert(c1, Value::Error(ValueError::DivisionByZero));
    vs.insert(d1, Value::Number(4.0));
    // ignore=3 → skip blanks AND errors.
    let (r, c, data) = unwrap_array(eval_str("=TOROW(A1:D1, 3)", &cm, &vs));
    assert_eq!((r, c), (1, 2));
    assert_eq!(data, vec![Value::Number(1.0), Value::Number(4.0)]);
    // ignore=1 → skip blanks only (errors remain).
    let (r, c, data) = unwrap_array(eval_str("=TOROW(A1:D1, 1)", &cm, &vs));
    assert_eq!((r, c), (1, 3));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Error(ValueError::DivisionByZero),
            Value::Number(4.0),
        ]
    );
    assert_eq!(
        eval_str("=TOROW(B1:C1, 3)", &cm, &vs),
        Value::Error(ValueError::Calc)
    );
    assert_eq!(
        eval_str("=TOCOL(B1:C1, 3)", &cm, &vs),
        Value::Error(ValueError::Calc)
    );
}

#[test]
fn eval_torow_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TOROW()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_tocol_basic_row_major() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(2,3) → 6 entries, default row-major → [1,2,3,4,5,6].
    let (r, c, data) = unwrap_array(eval_str("=TOCOL(SEQUENCE(2, 3))", &cm, &vs));
    assert_eq!((r, c), (6, 1));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
            Value::Number(5.0),
            Value::Number(6.0),
        ]
    );
}

#[test]
fn eval_tocol_by_column_skip_blanks() {
    // Build a 2×2 grid where (0,1) is blank.
    //   A1=1 B1=Null
    //   A2=3 B2=4
    // Column-major: 1, 3, Null, 4 → with skip-blanks → 1, 3, 4.
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    let a2 = AtomId::from_raw(2);
    let b2 = AtomId::from_raw(3);
    cm.insert(CellAddress::new(0, 0), a1);
    cm.insert(CellAddress::new(0, 1), b1);
    cm.insert(CellAddress::new(1, 0), a2);
    cm.insert(CellAddress::new(1, 1), b2);
    vs.insert(a1, Value::Number(1.0));
    vs.insert(b1, Value::Null);
    vs.insert(a2, Value::Number(3.0));
    vs.insert(b2, Value::Number(4.0));
    let (r, c, data) = unwrap_array(eval_str("=TOCOL(A1:B2, 1, TRUE)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(3.0), Value::Number(4.0)]
    );
}
