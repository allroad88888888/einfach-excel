//! ASC/JIS/DBCS 的半角全角互转。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Asian text-conversion functions (ASC / JIS / DBCS / PHONETIC) ===
//
// The mapping tables live in `asc_convert` / `jis_convert`. Tests
// below cover: ASCII width swap, half/full-width katakana, voicing
// composition / decomposition, the Excel JIS yen-sign quirk, mixed
// text pass-through, empty input, arg count, and error propagation.

#[test]
fn eval_asc_ascii_round_trip() {
    let (cm, vs) = make_test_env();
    // JIS widens ASCII, ASC narrows it back — full round-trip.
    assert_eq!(
        eval_str("=ASC(JIS(\"abc\"))", &cm, &vs),
        Value::Text("abc".into())
    );
}

#[test]
fn eval_jis_ascii_round_trip() {
    let (cm, vs) = make_test_env();
    // ASC narrows full-width "ＡＢＣ" (U+FF21..) to "ABC", then JIS
    // widens it back — bit-for-bit identical to the input.
    assert_eq!(
        eval_str("=JIS(ASC(\"\u{FF21}\u{FF22}\u{FF23}\"))", &cm, &vs),
        Value::Text("\u{FF21}\u{FF22}\u{FF23}".into())
    );
}

#[test]
fn eval_asc_widens_ascii_directly() {
    let (cm, vs) = make_test_env();
    // Direct narrowing: each full-width letter shifts by 0xFEE0.
    assert_eq!(
        eval_str("=ASC(\"\u{FF21}\u{FF22}\u{FF23}\")", &cm, &vs),
        Value::Text("ABC".into())
    );
}

#[test]
fn eval_jis_widens_ascii_directly() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=JIS(\"ABC\")", &cm, &vs),
        Value::Text("\u{FF21}\u{FF22}\u{FF23}".into())
    );
}

#[test]
fn eval_dbcs_aliases_jis() {
    let (cm, vs) = make_test_env();
    // DBCS is the Excel-2013 alias for JIS — they must produce
    // identical output for every input.
    assert_eq!(
        eval_str("=DBCS(\"ABC\")", &cm, &vs),
        eval_str("=JIS(\"ABC\")", &cm, &vs),
    );
}

#[test]
fn eval_asc_voiced_katakana_decomposes() {
    let (cm, vs) = make_test_env();
    // ガ (U+30AC) → ｶ (U+FF76) + ﾞ (U+FF9E).
    assert_eq!(
        eval_str("=ASC(\"\u{30AC}\")", &cm, &vs),
        Value::Text("\u{FF76}\u{FF9E}".into())
    );
    // パ (U+30D1) → ﾊ (U+FF8A) + ﾟ (U+FF9F).
    assert_eq!(
        eval_str("=ASC(\"\u{30D1}\")", &cm, &vs),
        Value::Text("\u{FF8A}\u{FF9F}".into())
    );
    // ヴ (U+30F4) — special-cased to ｳ + ﾞ.
    assert_eq!(
        eval_str("=ASC(\"\u{30F4}\")", &cm, &vs),
        Value::Text("\u{FF73}\u{FF9E}".into())
    );
}

#[test]
fn eval_jis_voiced_katakana_composes() {
    let (cm, vs) = make_test_env();
    // ｶ + ﾞ → ガ (one full-width char).
    assert_eq!(
        eval_str("=JIS(\"\u{FF76}\u{FF9E}\")", &cm, &vs),
        Value::Text("\u{30AC}".into())
    );
    // ﾊ + ﾟ → パ.
    assert_eq!(
        eval_str("=JIS(\"\u{FF8A}\u{FF9F}\")", &cm, &vs),
        Value::Text("\u{30D1}".into())
    );
    // ｳ + ﾞ → ヴ.
    assert_eq!(
        eval_str("=JIS(\"\u{FF73}\u{FF9E}\")", &cm, &vs),
        Value::Text("\u{30F4}".into())
    );
}

#[test]
fn eval_asc_mixed_text_passthrough() {
    let (cm, vs) = make_test_env();
    // Full-width "Ｈｅｌｌｏ" + full-width space + CJK ideographs.
    // ASCII letters and space convert; CJK passes through.
    assert_eq!(
        eval_str(
            "=ASC(\"\u{FF28}\u{FF45}\u{FF4C}\u{FF4C}\u{FF4F}\u{3000}\u{4E16}\u{754C}\")",
            &cm,
            &vs
        ),
        Value::Text("Hello \u{4E16}\u{754C}".into())
    );
}

#[test]
fn eval_asc_yen_sign_becomes_backslash() {
    let (cm, vs) = make_test_env();
    // U+FFE5 ￥ → U+005C \ per Excel's JIS code page convention.
    // Despite the glyph, the byte is backslash in CP932 / Shift-JIS.
    assert_eq!(
        eval_str("=ASC(\"\u{FFE5}100\")", &cm, &vs),
        Value::Text("\\100".into())
    );
}

#[test]
fn eval_asc_empty_input() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ASC(\"\")", &cm, &vs), Value::Text("".into()));
}

#[test]
fn eval_jis_empty_input() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=JIS(\"\")", &cm, &vs), Value::Text("".into()));
}

#[test]
fn eval_asc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    // Zero args.
    assert_eq!(
        eval_str("=ASC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Two args.
    assert_eq!(
        eval_str("=ASC(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_jis_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=JIS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=DBCS(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_asc_error_propagates() {
    let (cm, vs) = make_test_env();
    // Upstream #DIV/0! must flow out unchanged; ASC must not swallow
    // it into a Text("#DIV/0!") string.
    assert_eq!(
        eval_str("=ASC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_jis_error_propagates() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=JIS(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
