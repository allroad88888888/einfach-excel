//! 常用内建函数的最小冒烟覆盖。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_math_funcs() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ABS(-7)", &cm, &vs), Value::Number(7.0));
    assert_eq!(eval_str("=SQRT(16)", &cm, &vs), Value::Number(4.0));
    assert_eq!(eval_str("=ROUND(3.14159,2)", &cm, &vs), Value::Number(3.14));
    assert_eq!(eval_str("=CEILING(3.2)", &cm, &vs), Value::Number(4.0));
    assert_eq!(eval_str("=FLOOR(3.9)", &cm, &vs), Value::Number(3.0));
    assert_eq!(eval_str("=POWER(2,10)", &cm, &vs), Value::Number(1024.0));
    assert_eq!(eval_str("=MOD(10,3)", &cm, &vs), Value::Number(1.0));
}

#[test]
fn eval_text_funcs() {
    let (cm, vs) = make_test_env();
    // B2 = "text"
    assert_eq!(
        eval_str("=CONCATENATE(B2,\" \",A1)", &cm, &vs),
        Value::Text("text 10".into())
    );
    assert_eq!(eval_str("=LEN(B2)", &cm, &vs), Value::Number(4.0));
    assert_eq!(eval_str("=LEFT(B2,2)", &cm, &vs), Value::Text("te".into()));
    assert_eq!(eval_str("=RIGHT(B2,2)", &cm, &vs), Value::Text("xt".into()));
    assert_eq!(eval_str("=MID(B2,2,2)", &cm, &vs), Value::Text("ex".into()));
    assert_eq!(eval_str("=UPPER(B2)", &cm, &vs), Value::Text("TEXT".into()));
    assert_eq!(
        eval_str("=LOWER(\"HELLO\")", &cm, &vs),
        Value::Text("hello".into())
    );
    assert_eq!(
        eval_str("=TRIM(\"  hi  \")", &cm, &vs),
        Value::Text("hi".into())
    );

    assert_eq!(
        eval_str("=TEXT(1234.5,\"0.00\")", &cm, &vs),
        Value::Text("1234.50".into())
    );
    assert_eq!(
        eval_str("=TEXT(7,\"000\")", &cm, &vs),
        Value::Text("007".into())
    );
    assert_eq!(
        eval_str("=TEXT(\"7\",\"0.00\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_stats() {
    let (cm, vs) = make_test_env();
    // A1=10, B1=20, A2=5
    assert_eq!(eval_str("=MEDIAN(A1,B1,A2)", &cm, &vs), Value::Number(10.0));
    // STDEV / VAR for {10, 20, 5}: mean=11.66… so they should be > 0
    let stdev = eval_str("=STDEV(A1,B1,A2)", &cm, &vs);
    assert!(matches!(stdev, Value::Number(n) if n > 0.0));
    let var = eval_str("=VAR(A1,B1,A2)", &cm, &vs);
    assert!(matches!(var, Value::Number(n) if n > 0.0));
}
