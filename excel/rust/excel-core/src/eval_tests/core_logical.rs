//! IF/IFERROR/IFS/SWITCH/XOR 与布尔错误字面量。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_if_true() {
    let (cm, vs) = make_test_env();
    // IF(A1, 100, 200) → A1=10 (truthy) → 100
    assert_eq!(eval_str("=IF(A1,100,200)", &cm, &vs), Value::Number(100.0));
}

#[test]
fn eval_if_false() {
    let (cm, vs) = make_test_env();
    // IF(C1, 100, 200) → C1=0 (falsy) → 200
    assert_eq!(eval_str("=IF(C1,100,200)", &cm, &vs), Value::Number(200.0));
}

#[test]
fn eval_if_with_comparison() {
    let (cm, vs) = make_test_env();
    // IF(A1>5, "big", "small") — A1=10 → "big"
    assert_eq!(
        eval_str("=IF(A1>5,\"big\",\"small\")", &cm, &vs),
        Value::Text("big".into())
    );
}

#[test]
fn eval_logical_and() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=AND(A1>0,B1>0)", &cm, &vs), Value::Boolean(true));
    assert_eq!(
        eval_str("=AND(A1>100,B1>0)", &cm, &vs),
        Value::Boolean(false)
    );
}

#[test]
fn eval_logical_or_not() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=OR(A1>100,B1>0)", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=NOT(A1>5)", &cm, &vs), Value::Boolean(false));
}

// === Batch B1: error/type-guard formulas ===

#[test]
fn eval_iferror() {
    let (cm, vs) = make_test_env();
    // Happy path: errored expression replaced.
    assert_eq!(eval_str("=IFERROR(1/0,99)", &cm, &vs), Value::Number(99.0));
    // Non-error passes through unchanged.
    assert_eq!(eval_str("=IFERROR(A1,99)", &cm, &vs), Value::Number(10.0));
    // Text fallback works too.
    assert_eq!(
        eval_str("=IFERROR(1/0,\"nope\")", &cm, &vs),
        Value::Text("nope".into())
    );
    // Wrong-arg-count.
    assert_eq!(
        eval_str("=IFERROR(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_ifna() {
    let (cm, vs) = make_test_env();
    // VLOOKUP miss surfaces as #N/A → caught by IFNA.
    assert_eq!(
        eval_str("=IFNA(VLOOKUP(999,A1:B2,2,FALSE),0)", &cm, &vs),
        Value::Number(0.0)
    );
    // DivisionByZero is NOT N/A-like → propagates.
    assert_eq!(
        eval_str("=IFNA(1/0,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // Real #VALUE! is not #N/A and must not be caught.
    assert_eq!(
        eval_str("=IFNA(TEXTBEFORE(\"abc\",\"-\",1,0,2),0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Non-error passes through.
    assert_eq!(eval_str("=IFNA(A1,0)", &cm, &vs), Value::Number(10.0));
    // Wrong arity.
    assert_eq!(
        eval_str("=IFNA(A1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_ifs() {
    let (cm, vs) = make_test_env();
    // First truthy condition wins. A1=10 so A1>5 → "big".
    assert_eq!(
        eval_str("=IFS(A1>100,\"huge\",A1>5,\"big\",TRUE,\"x\")", &cm, &vs),
        Value::Text("big".into())
    );
    // No condition matches → InvalidValue.
    assert_eq!(
        eval_str("=IFS(A1>100,1,A1<0,2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Odd/empty arg count → InvalidValue (#VALUE!).
    assert_eq!(
        eval_str("=IFS(A1>0,1,A1>0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=IFS()", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Error in a condition propagates.
    assert_eq!(
        eval_str("=IFS(1/0,1,TRUE,2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_switch() {
    let (cm, vs) = make_test_env();
    // Match case → returns matching val. A1=10 matches second pair.
    assert_eq!(
        eval_str("=SWITCH(A1,5,\"five\",10,\"ten\",\"def\")", &cm, &vs),
        Value::Text("ten".into())
    );
    // No match, trailing default returned.
    assert_eq!(
        eval_str("=SWITCH(A1,1,\"a\",2,\"b\",\"default\")", &cm, &vs),
        Value::Text("default".into())
    );
    // No match and no default → InvalidValue.
    assert_eq!(
        eval_str("=SWITCH(A1,1,\"a\",2,\"b\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Min 3 args.
    assert_eq!(
        eval_str("=SWITCH(A1,1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error in expr propagates.
    assert_eq!(
        eval_str("=SWITCH(1/0,1,\"a\",\"def\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_xor() {
    let (cm, vs) = make_test_env();
    // Odd count of TRUE → true.
    assert_eq!(
        eval_str("=XOR(TRUE,FALSE,FALSE)", &cm, &vs),
        Value::Boolean(true)
    );
    // Even count of TRUE → false.
    assert_eq!(eval_str("=XOR(TRUE,TRUE)", &cm, &vs), Value::Boolean(false));
    // Numeric coercion (non-zero is true).
    assert_eq!(eval_str("=XOR(1,0,2)", &cm, &vs), Value::Boolean(false));
    // No args → WrongArgCount.
    assert_eq!(
        eval_str("=XOR()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Text → WrongType.
    assert_eq!(
        eval_str("=XOR(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagates.
    assert_eq!(
        eval_str("=XOR(1/0,TRUE)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- TRUE / FALSE / NA ---

#[test]
fn true_function_returns_boolean() {
    assert_eq!(ev("=TRUE()"), Value::Boolean(true));
}

#[test]
fn false_function_returns_boolean() {
    assert_eq!(ev("=FALSE()"), Value::Boolean(false));
}

#[test]
fn bare_true_false_still_literal() {
    // Without parens these remain pure literals (Expr::Bool).
    assert_eq!(ev("=TRUE"), Value::Boolean(true));
    assert_eq!(ev("=FALSE"), Value::Boolean(false));
}

#[test]
fn true_false_reject_args() {
    assert_eq!(ev("=TRUE(1)"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(ev("=FALSE(1)"), Value::Error(ValueError::WrongArgCount));
}

#[test]
fn na_returns_not_available_error() {
    assert_eq!(ev("=NA()"), Value::Error(ValueError::NotAvailable));
}

#[test]
fn error_literals_evaluate_to_matching_errors() {
    assert_eq!(ev("=#CALC!"), Value::Error(ValueError::Calc));
    assert_eq!(ev("=#N/A"), Value::Error(ValueError::NotAvailable));
    assert_eq!(ev("=#DIV/0!"), Value::Error(ValueError::DivisionByZero));
}

#[test]
fn na_rejects_args() {
    assert_eq!(ev("=NA(1)"), Value::Error(ValueError::WrongArgCount));
}
