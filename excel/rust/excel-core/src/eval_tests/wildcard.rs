//! 通配符匹配原语与 criteria 字符串的匹配判定。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Wildcard matching tests ===

#[test]
fn wildcard_match_bare_and_case_insensitive() {
    assert!(wildcard_match("apple", "apple"));
    assert!(wildcard_match("apple", "Apple"));
    assert!(wildcard_match("APPLE", "apple"));
    assert!(!wildcard_match("apple", "banana"));
    assert!(wildcard_match("", ""));
    assert!(!wildcard_match("", "x"));
    assert!(!wildcard_match("x", ""));
}

#[test]
fn wildcard_match_star_positions() {
    // `*` at start / middle / end.
    assert!(wildcard_match("*pple", "apple"));
    assert!(wildcard_match("*pple", "pineapple")); // matches "pineap" + "ple"
    assert!(wildcard_match("a*e", "apple"));
    assert!(wildcard_match("a*e", "ae"));
    assert!(wildcard_match("app*", "apple"));
    assert!(wildcard_match("app*", "app"));
    assert!(!wildcard_match("app*", "ap"));
    // Bare `*` matches anything.
    assert!(wildcard_match("*", "anything"));
    assert!(wildcard_match("*", ""));
}

#[test]
fn wildcard_match_question_mark_exact_one_char() {
    assert!(wildcard_match("?pple", "apple"));
    assert!(!wildcard_match("?pple", "pple"));
    assert!(!wildcard_match("?pple", "aapple"));
    assert!(wildcard_match("a?", "ab"));
    assert!(!wildcard_match("a?", "a"));
}

#[test]
fn wildcard_match_mixed_patterns() {
    // a?p* — a, any-1, p, then anything.
    // apple: a-p-p-l-e → pattern wants a + ? + p + …; '?' eats 'p',
    // then literal 'p' matches 'p', `*` eats 'le'. ✓
    assert!(wildcard_match("a?p*", "apple"));
    assert!(wildcard_match("a?p*", "apply"));
    // apricot: a-p-r-… — pattern needs a + ? + p, but char[2] is 'r',
    // not 'p'. So a?p* does NOT match apricot.
    assert!(!wildcard_match("a?p*", "apricot"));
    // a*p* DOES match apricot (a + anything + p + anything).
    assert!(wildcard_match("a*p*", "apricot"));
    // ap?* matches all three: apple, apply, apricot.
    assert!(wildcard_match("ap?*", "apple"));
    assert!(wildcard_match("ap?*", "apply"));
    assert!(wildcard_match("ap?*", "apricot"));
}

#[test]
fn wildcard_match_escaped_specials() {
    // `~*` is a literal asterisk.
    assert!(wildcard_match("a~*b", "a*b"));
    assert!(!wildcard_match("a~*b", "axb"));
    // `~?` is a literal question mark.
    assert!(wildcard_match("a~?b", "a?b"));
    assert!(!wildcard_match("a~?b", "axb"));
    // `~~` is a literal tilde.
    assert!(wildcard_match("a~~b", "a~b"));
    // Escape applies once; subsequent `*` is still wildcard.
    assert!(wildcard_match("~*a*", "*apple"));
}

#[test]
fn matches_criterion_wildcards_against_text() {
    // `*` and `?` honored on text inputs (no operator prefix).
    assert!(matches_criterion(
        &Value::Text("apple".into()),
        &Value::Text("a*e".into())
    ));
    // Wildcard matching is case-insensitive (Excel parity).
    assert!(matches_criterion(
        &Value::Text("Apple".into()),
        &Value::Text("a*e".into())
    ));
    // With explicit `=` and wildcard.
    assert!(matches_criterion(
        &Value::Text("Apple".into()),
        &Value::Text("=ap*".into())
    ));
    // `<>` with wildcard pattern: negation.
    assert!(matches_criterion(
        &Value::Text("banana".into()),
        &Value::Text("<>a*".into())
    ));
    assert!(!matches_criterion(
        &Value::Text("apple".into()),
        &Value::Text("<>a*".into())
    ));
    // Escaped wildcard: criterion `~*` matches literal "*".
    assert!(matches_criterion(
        &Value::Text("*".into()),
        &Value::Text("~*".into())
    ));
    // `?` for one-char.
    assert!(matches_criterion(
        &Value::Text("cat".into()),
        &Value::Text("?at".into())
    ));
    assert!(!matches_criterion(
        &Value::Text("cat".into()),
        &Value::Text("?att".into())
    ));
}

#[test]
fn matches_criterion_regression_operators_still_work() {
    // Numeric ops still resolve correctly (no wildcard branch taken).
    assert!(matches_criterion(
        &Value::Number(10.0),
        &Value::Text(">5".into())
    ));
    assert!(!matches_criterion(
        &Value::Number(3.0),
        &Value::Text(">5".into())
    ));
    assert!(matches_criterion(
        &Value::Number(5.0),
        &Value::Text(">=5".into())
    ));
    // `<>y` 非通配符档：真的「不等于」。这里曾经无视 op 直接回 text-eq，
    // 于是 `COUNTIF(rng,"<>y")` 数的是**等于** y 的格子，正好反了。
    assert!(matches_criterion(
        &Value::Text("x".into()),
        &Value::Text("<>y".into())
    ));
    assert!(!matches_criterion(
        &Value::Text("y".into()),
        &Value::Text("<>y".into())
    ));
    // 同一档承载「条件字符串里写错误码」：错误格按显示文本比。
    assert!(matches_criterion(
        &Value::Error(ValueError::NotAvailable),
        &Value::Text("#N/A".into())
    ));
    assert!(matches_criterion(
        &Value::Error(ValueError::DivisionByZero),
        &Value::Text("<>#N/A".into())
    ));
    // Bare equality on numbers.
    assert!(matches_criterion(&Value::Number(7.0), &Value::Number(7.0)));
}
