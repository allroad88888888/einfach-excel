//! ROW/COLUMN/ROWS/COLUMNS 的行列号与计数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ===== Reference / lookup tests =====

#[test]
fn eval_row() {
    let (cm, vs) = make_test_env();
    // Happy path: A1 is row 1, B5 is row 5.
    assert_eq!(eval_str("=ROW(A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=ROW(B5)", &cm, &vs), Value::Number(5.0));
    // Range arg: ROW returns the start row.
    assert_eq!(eval_str("=ROW(A3:B7)", &cm, &vs), Value::Number(3.0));
    // No args → InvalidRef under the legacy `AtomEvalProvider`, which
    // has no concept of "current cell" and returns `None` from
    // `current_cell()`. `Workbook` / `Sheet` providers fill it in so
    // `=ROW()` in a real workbook returns the formula's own row — see
    // `tests/reference_lookup.rs::row_column_no_args_uses_current_cell`.
    assert_eq!(
        eval_str("=ROW()", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
    // Too many args.
    assert_eq!(
        eval_str("=ROW(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Non-ref arg → WrongType.
    assert_eq!(
        eval_str("=ROW(42)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_column() {
    let (cm, vs) = make_test_env();
    // Happy path: A1 → col 1, C7 → col 3.
    assert_eq!(eval_str("=COLUMN(A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=COLUMN(C7)", &cm, &vs), Value::Number(3.0));
    // Range arg: COLUMN returns the start column.
    assert_eq!(eval_str("=COLUMN(D2:F8)", &cm, &vs), Value::Number(4.0));
    // No args → InvalidRef under the legacy `AtomEvalProvider` (no
    // current-cell concept). See sibling `eval_row` comment for the
    // workbook-context behaviour.
    assert_eq!(
        eval_str("=COLUMN()", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
    // Too many args.
    assert_eq!(
        eval_str("=COLUMN(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Non-ref arg → WrongType.
    assert_eq!(
        eval_str("=COLUMN(\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_rows() {
    let (cm, vs) = make_test_env();
    // Single-cell ref → 1.
    assert_eq!(eval_str("=ROWS(A1)", &cm, &vs), Value::Number(1.0));
    // 3-row range.
    assert_eq!(eval_str("=ROWS(A1:B3)", &cm, &vs), Value::Number(3.0));
    // Reversed orientation still counts |Δrow|+1.
    assert_eq!(eval_str("=ROWS(A5:A2)", &cm, &vs), Value::Number(4.0));
    // Wrong arg count.
    assert_eq!(
        eval_str("=ROWS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ROWS(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Non-range arg.
    assert_eq!(
        eval_str("=ROWS(42)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_columns() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=COLUMNS(A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=COLUMNS(A1:C3)", &cm, &vs), Value::Number(3.0));
    assert_eq!(eval_str("=COLUMNS(C1:A1)", &cm, &vs), Value::Number(3.0));
    assert_eq!(
        eval_str("=COLUMNS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COLUMNS(\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
