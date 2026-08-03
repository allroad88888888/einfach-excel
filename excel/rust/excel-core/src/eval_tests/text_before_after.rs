//! TEXTBEFORE/TEXTAFTER 的分隔符定位截取。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === TEXTBEFORE / TEXTAFTER ===

#[test]
fn eval_textbefore_happy_path() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"alpha-beta-gamma\", \"-\")", &cm, &vs),
        Value::Text("alpha".into())
    );
    // 2nd occurrence.
    assert_eq!(
        eval_str("=TEXTBEFORE(\"alpha-beta-gamma\", \"-\", 2)", &cm, &vs),
        Value::Text("alpha-beta".into())
    );
}

#[test]
fn eval_textafter_happy_path() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTAFTER(\"alpha-beta-gamma\", \"-\")", &cm, &vs),
        Value::Text("beta-gamma".into())
    );
    assert_eq!(
        eval_str("=TEXTAFTER(\"alpha-beta-gamma\", \"-\", 2)", &cm, &vs),
        Value::Text("gamma".into())
    );
}

/// Negative `instance_num` counts from the right. -1 = last occurrence.
#[test]
fn eval_textbefore_negative_instance() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"a-b-c-d\", \"-\", -1)", &cm, &vs),
        Value::Text("a-b-c".into())
    );
    assert_eq!(
        eval_str("=TEXTAFTER(\"a-b-c-d\", \"-\", -1)", &cm, &vs),
        Value::Text("d".into())
    );
}

/// Not-found surfaces `#N/A` when no `if_not_found` arg is supplied,
/// and the custom value when one is.
#[test]
fn eval_textbefore_not_found_default_and_custom() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"abc\", \"-\")", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
    assert_eq!(
        eval_str("=TEXTBEFORE(\"abc\", \"-\", 1, 0, 0, \"miss\")", &cm, &vs),
        Value::Text("miss".into())
    );
}

#[test]
fn eval_textbefore_after_lazy_error_fallback() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"a-b\", \"-\", 1, 0, 0, #N/A)", &cm, &vs),
        Value::Text("a".into())
    );
    assert_eq!(
        eval_str("=TEXTAFTER(\"a-b\", \"-\", 1, 0, 0, 1/0)", &cm, &vs),
        Value::Text("b".into())
    );
    assert_eq!(
        eval_str("=TEXTBEFORE(\"ab\", \"-\", 1, 0, 0, #N/A)", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
}

/// Case-insensitive mode (1) lets `"X"` match `"x"`.
#[test]
fn eval_textbefore_case_insensitive() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"axb\", \"X\", 1, 1)", &cm, &vs),
        Value::Text("a".into())
    );
    // Without insensitive mode, no match.
    assert_eq!(
        eval_str("=TEXTBEFORE(\"axb\", \"X\")", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
}

#[test]
fn eval_textbefore_arg_count_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTBEFORE(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// match_end=1 treats end-of-string as a virtual match, so the last
/// occurrence is the implicit endpoint.
#[test]
fn eval_textafter_match_end() {
    let (cm, vs) = make_test_env();
    // "a-b" has matches at byte 0 (virtual start), byte 1 (real "-"),
    // byte 3 (virtual end). instance=-1 picks byte 3 → "".
    assert_eq!(
        eval_str("=TEXTAFTER(\"a-b\", \"-\", -1, 0, 1)", &cm, &vs),
        Value::Text("".into())
    );
}
