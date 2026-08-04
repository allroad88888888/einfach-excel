//! IS* 谓词与 N/TYPE 对单元格值的类型判定。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_isnumber() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISNUMBER(A1)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISNUMBER(B2)", &cm, &vs), Value::Boolean(false));
    // Boolean is not a number.
    assert_eq!(eval_str("=ISNUMBER(TRUE)", &cm, &vs), Value::Boolean(false));
    // Errors are classified, not propagated.
    assert_eq!(eval_str("=ISNUMBER(1/0)", &cm, &vs), Value::Boolean(false));
    // Wrong arity.
    assert_eq!(
        eval_str("=ISNUMBER(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_istext() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISTEXT(B2)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISTEXT(A1)", &cm, &vs), Value::Boolean(false));
    // Null is not text.
    assert_eq!(eval_str("=ISTEXT(Z99)", &cm, &vs), Value::Boolean(false));
    // Error is not text — classified, not propagated.
    assert_eq!(eval_str("=ISTEXT(1/0)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISTEXT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_isblank() {
    let (cm, vs) = make_test_env();
    // Z99 is missing → Null.
    assert_eq!(eval_str("=ISBLANK(Z99)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISBLANK(A1)", &cm, &vs), Value::Boolean(false));
    assert_eq!(eval_str("=ISBLANK(B2)", &cm, &vs), Value::Boolean(false));
    // Error is not blank — classified, not propagated.
    assert_eq!(eval_str("=ISBLANK(1/0)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISBLANK(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_iserror() {
    let (cm, vs) = make_test_env();
    // Any error variant is detected.
    assert_eq!(eval_str("=ISERROR(1/0)", &cm, &vs), Value::Boolean(true));
    assert_eq!(
        eval_str("=ISERROR(VLOOKUP(999,A1:B2,2,FALSE))", &cm, &vs),
        Value::Boolean(true)
    );
    // Non-errors are false.
    assert_eq!(eval_str("=ISERROR(A1)", &cm, &vs), Value::Boolean(false));
    assert_eq!(eval_str("=ISERROR(B2)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISERROR()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_iserr() {
    let (cm, vs) = make_test_env();
    // DivisionByZero is an error but not NA-like → true.
    assert_eq!(eval_str("=ISERR(1/0)", &cm, &vs), Value::Boolean(true));
    // VLOOKUP miss → InvalidValue (our NA-equivalent) → false.
    assert_eq!(
        eval_str("=ISERR(VLOOKUP(999,A1:B2,2,FALSE))", &cm, &vs),
        Value::Boolean(false)
    );
    // Real #VALUE! is an error other than #N/A.
    assert_eq!(
        eval_str("=ISERR(TEXTBEFORE(\"abc\",\"-\",1,0,2))", &cm, &vs),
        Value::Boolean(true)
    );
    // Non-errors are false.
    assert_eq!(eval_str("=ISERR(A1)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISERR(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_isna() {
    let (cm, vs) = make_test_env();
    // VLOOKUP miss surfaces as #N/A → ISNA true.
    assert_eq!(
        eval_str("=ISNA(VLOOKUP(999,A1:B2,2,FALSE))", &cm, &vs),
        Value::Boolean(true)
    );
    // DivisionByZero is an error, but not NA-like.
    assert_eq!(eval_str("=ISNA(1/0)", &cm, &vs), Value::Boolean(false));
    // Real #VALUE! is not #N/A.
    assert_eq!(
        eval_str("=ISNA(TEXTBEFORE(\"abc\",\"-\",1,0,2))", &cm, &vs),
        Value::Boolean(false)
    );
    // Non-error → false.
    assert_eq!(eval_str("=ISNA(A1)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISNA()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_islogical() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISLOGICAL(TRUE)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISLOGICAL(A1>0)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISLOGICAL(A1)", &cm, &vs), Value::Boolean(false));
    assert_eq!(eval_str("=ISLOGICAL(B2)", &cm, &vs), Value::Boolean(false));
    // Error classified, not propagated.
    assert_eq!(eval_str("=ISLOGICAL(1/0)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISLOGICAL(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_isnontext() {
    let (cm, vs) = make_test_env();
    // Number, Boolean, Null, Error all count as non-text.
    assert_eq!(eval_str("=ISNONTEXT(A1)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISNONTEXT(TRUE)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISNONTEXT(Z99)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISNONTEXT(1/0)", &cm, &vs), Value::Boolean(true));
    // Text → false.
    assert_eq!(eval_str("=ISNONTEXT(B2)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISNONTEXT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_iseven() {
    let (cm, vs) = make_test_env();
    // A1=10 → even.
    assert_eq!(eval_str("=ISEVEN(A1)", &cm, &vs), Value::Boolean(true));
    // A2=5 → odd.
    assert_eq!(eval_str("=ISEVEN(A2)", &cm, &vs), Value::Boolean(false));
    // Truncation toward zero: 4.7 → 4 → even.
    assert_eq!(eval_str("=ISEVEN(4.7)", &cm, &vs), Value::Boolean(true));
    // Boolean TRUE coerces to 1 → odd.
    assert_eq!(eval_str("=ISEVEN(TRUE)", &cm, &vs), Value::Boolean(false));
    // Text → WrongType.
    assert_eq!(
        eval_str("=ISEVEN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagates.
    assert_eq!(
        eval_str("=ISEVEN(1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=ISEVEN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_isodd() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISODD(A2)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=ISODD(A1)", &cm, &vs), Value::Boolean(false));
    // Truncation toward zero: 3.9 → 3 → odd.
    assert_eq!(eval_str("=ISODD(3.9)", &cm, &vs), Value::Boolean(true));
    // Text → WrongType.
    assert_eq!(
        eval_str("=ISODD(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagates.
    assert_eq!(
        eval_str("=ISODD(1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=ISODD(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_n() {
    let (cm, vs) = make_test_env();
    // Number passes through.
    assert_eq!(eval_str("=N(A1)", &cm, &vs), Value::Number(10.0));
    // Boolean true → 1, false → 0.
    assert_eq!(eval_str("=N(TRUE)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=N(FALSE)", &cm, &vs), Value::Number(0.0));
    // Text → 0 (Excel quirk).
    assert_eq!(eval_str("=N(B2)", &cm, &vs), Value::Number(0.0));
    // Null → 0.
    assert_eq!(eval_str("=N(Z99)", &cm, &vs), Value::Number(0.0));
    // Error propagates.
    assert_eq!(
        eval_str("=N(1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=N()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_type() {
    let (cm, vs) = make_test_env();
    // Number → 1.
    assert_eq!(eval_str("=TYPE(A1)", &cm, &vs), Value::Number(1.0));
    // Text → 2.
    assert_eq!(eval_str("=TYPE(B2)", &cm, &vs), Value::Number(2.0));
    // Boolean → 4.
    assert_eq!(eval_str("=TYPE(TRUE)", &cm, &vs), Value::Number(4.0));
    // Error → 16 (not propagated).
    assert_eq!(eval_str("=TYPE(1/0)", &cm, &vs), Value::Number(16.0));
    // Null → 1 (Excel quirk).
    assert_eq!(eval_str("=TYPE(Z99)", &cm, &vs), Value::Number(1.0));
    assert_eq!(
        eval_str("=TYPE(A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

// --- ISREF ---

#[test]
fn isref_true_for_bare_cell_ref() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISREF(A1)", &cm, &vs), Value::Boolean(true));
}

#[test]
fn isref_true_for_range() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISREF(A1:B2)", &cm, &vs), Value::Boolean(true));
}

#[test]
fn isref_false_for_literal() {
    assert_eq!(ev("=ISREF(42)"), Value::Boolean(false));
    assert_eq!(ev("=ISREF(\"hello\")"), Value::Boolean(false));
}

#[test]
fn isref_false_for_arithmetic() {
    let (cm, vs) = make_test_env();
    // A1 + 1 is an arithmetic expression, not a bare ref.
    assert_eq!(eval_str("=ISREF(A1+1)", &cm, &vs), Value::Boolean(false));
}

#[test]
fn isref_wrong_arg_count() {
    assert_eq!(ev("=ISREF()"), Value::Error(ValueError::WrongArgCount));
}
