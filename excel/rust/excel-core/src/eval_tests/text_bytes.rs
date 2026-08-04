//! LENB/LEFTB/MIDB/FINDB 等按字节计数的双字节文本函数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// LENB / LEFTB / RIGHTB / MIDB / FINDB / SEARCHB / REPLACEB
#[test]
fn eval_lenb_japanese() {
    // "あいう" = 3 chars × 2 bytes = 6.
    assert_eq!(ev(r#"=LENB("あいう")"#), Value::Number(6.0));
}

#[test]
fn eval_lenb_mixed() {
    // "abcあ" = 3 + 2 = 5.
    assert_eq!(ev(r#"=LENB("abcあ")"#), Value::Number(5.0));
}

#[test]
fn eval_lenb_ascii() {
    assert_eq!(ev(r#"=LENB("hello")"#), Value::Number(5.0));
}

#[test]
fn eval_leftb_clean_boundary() {
    // First 4 bytes of "abcあ" = "abc" + 1 byte of あ; the half-char
    // surfaces as a space.
    assert_eq!(ev(r#"=LEFTB("abcあ", 4)"#), Value::Text("abc ".into()));
}

#[test]
fn eval_leftb_full_char() {
    // First 5 bytes of "abcあ" = full "abcあ".
    assert_eq!(ev(r#"=LEFTB("abcあ", 5)"#), Value::Text("abcあ".into()));
}

#[test]
fn eval_leftb_default_is_1() {
    assert_eq!(ev(r#"=LEFTB("hello")"#), Value::Text("h".into()));
}

#[test]
fn eval_rightb_split_pad() {
    // Last 4 bytes of "abcあ" should pad the half-char with a space.
    // "abcあ" total = 5 bytes; right 4 starts at byte 2, splits "a"
    // away. Since the cut falls between 'a' and 'b' (clean), returns "bcあ" (4 bytes).
    assert_eq!(ev(r#"=RIGHTB("abcあ", 4)"#), Value::Text("bcあ".into()));
}

#[test]
fn eval_rightb_half_char() {
    // Right 1 byte of "あ" (2 bytes): split → " ".
    assert_eq!(ev(r#"=RIGHTB("あ", 1)"#), Value::Text(" ".into()));
}

#[test]
fn eval_rightb_default_is_1() {
    assert_eq!(ev(r#"=RIGHTB("hello")"#), Value::Text("o".into()));
}

#[test]
fn eval_midb_clean() {
    // MIDB("abcあ", 2, 2) = bytes 2..=3 = "bc"
    assert_eq!(ev(r#"=MIDB("abcあ", 2, 2)"#), Value::Text("bc".into()));
}

#[test]
fn eval_midb_half_char() {
    // MIDB("abcあ", 4, 1) = the first byte of あ → " "
    assert_eq!(ev(r#"=MIDB("abcあ", 4, 1)"#), Value::Text(" ".into()));
}

#[test]
fn eval_midb_past_end() {
    assert_eq!(ev(r#"=MIDB("abc", 10, 5)"#), Value::Text("".into()));
}

#[test]
fn eval_findb_japanese() {
    // FINDB("い", "あいう") — "い" starts at byte 3 (after "あ" = 2 bytes).
    assert_eq!(ev(r#"=FINDB("い", "あいう")"#), Value::Number(3.0));
}

#[test]
fn eval_findb_ascii_offset() {
    // FINDB("b", "abc", 1) = 2.
    assert_eq!(ev(r#"=FINDB("b", "abc")"#), Value::Number(2.0));
}

#[test]
fn eval_findb_not_found() {
    assert_eq!(
        ev(r#"=FINDB("x", "abc")"#),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_searchb_case_insensitive() {
    // SEARCHB ignores case; "B" matches "b" at byte 2.
    assert_eq!(ev(r#"=SEARCHB("B", "abc")"#), Value::Number(2.0));
}

#[test]
fn eval_searchb_japanese() {
    assert_eq!(ev(r#"=SEARCHB("う", "あいう")"#), Value::Number(5.0));
}

#[test]
fn eval_searchb_not_found() {
    assert_eq!(
        ev(r#"=SEARCHB("x", "abc")"#),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_replaceb_clean() {
    // REPLACEB("abcあ", 2, 2, "XYZ") = "a" + "XYZ" + "あ" = "aXYZあ"
    assert_eq!(
        ev(r#"=REPLACEB("abcあ", 2, 2, "XYZ")"#),
        Value::Text("aXYZあ".into())
    );
}

#[test]
fn eval_replaceb_full_string() {
    // Replace from byte 1, all 5 bytes.
    assert_eq!(
        ev(r#"=REPLACEB("abcあ", 1, 5, "NEW")"#),
        Value::Text("NEW".into())
    );
}

#[test]
fn eval_replaceb_split_boundary() {
    // Replace 1 byte starting at byte 4 (inside "あ"): the half-char
    // means left side keeps "abc" + space, replacement string, right
    // side starts mid-char → no right tail because the original 2-byte
    // char is fully consumed.
    // dbcs_take_left(text, 3) = "abc"; consumed_end = 3 + 1 = 4; total = 5;
    // dbcs_take_right(text, 1) = " " (half of あ).
    assert_eq!(
        ev(r#"=REPLACEB("abcあ", 4, 1, "X")"#),
        Value::Text("abcX ".into())
    );
}
