//! ENCODEURL 的百分号转义。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === ENCODEURL ===

/// Spaces encode as %20; reserved chars encode; unreserved
/// `[A-Za-z0-9-_.~]` pass through.
#[test]
fn eval_encodeurl_basic() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ENCODEURL(\"hello world\")", &cm, &vs),
        Value::Text("hello%20world".into())
    );
    assert_eq!(
        eval_str("=ENCODEURL(\"a-_.~b\")", &cm, &vs),
        Value::Text("a-_.~b".into())
    );
    assert_eq!(
        eval_str("=ENCODEURL(\"a/b?c=d&e\")", &cm, &vs),
        Value::Text("a%2Fb%3Fc%3Dd%26e".into())
    );
}

/// Multi-byte UTF-8 (the euro sign `€` = 0xE2 0x82 0xAC) encodes
/// per-byte.
#[test]
fn eval_encodeurl_unicode() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ENCODEURL(\"€\")", &cm, &vs),
        Value::Text("%E2%82%AC".into())
    );
}

/// Empty input → empty string. Numbers coerce to text first.
#[test]
fn eval_encodeurl_empty_and_numeric() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ENCODEURL(\"\")", &cm, &vs),
        Value::Text(String::new())
    );
    assert_eq!(
        eval_str("=ENCODEURL(123)", &cm, &vs),
        Value::Text("123".into())
    );
}

#[test]
fn eval_encodeurl_arg_count_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ENCODEURL()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
