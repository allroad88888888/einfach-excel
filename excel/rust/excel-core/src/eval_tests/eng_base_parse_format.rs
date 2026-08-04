//! 任意进制文本的解析与格式化原语。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Engineering / base-conversion / bit-op tests ===

#[test]
fn parse_base_n_text_bin_boundaries() {
    // BIN: 10 chars, 1 bit/digit. Width-10 with high bit set → negative.
    assert_eq!(parse_base_n_text("0", 2, 10, 1), Ok(0.0));
    assert_eq!(parse_base_n_text("1010", 2, 10, 1), Ok(10.0));
    assert_eq!(parse_base_n_text("0111111111", 2, 10, 1), Ok(511.0));
    // Max-width string with high bit set → -1 (...11111111 = -1).
    assert_eq!(parse_base_n_text("1111111111", 2, 10, 1), Ok(-1.0));
    // Max-width with only the sign bit set → -512.
    assert_eq!(parse_base_n_text("1000000000", 2, 10, 1), Ok(-512.0));
    // Shorter strings stay positive even if the leading bit is 1.
    assert_eq!(parse_base_n_text("111111111", 2, 10, 1), Ok(511.0));
    // Errors.
    assert_eq!(
        parse_base_n_text("", 2, 10, 1),
        Err(ValueError::InvalidValue)
    );
    assert_eq!(
        parse_base_n_text("11111111111", 2, 10, 1),
        Err(ValueError::InvalidValue),
    );
    assert_eq!(
        parse_base_n_text("12", 2, 10, 1),
        Err(ValueError::InvalidValue),
    );
    // OCT: 10 chars, 3 bits/digit (30-bit total).
    assert_eq!(parse_base_n_text("777", 8, 10, 3), Ok(511.0));
    // Width-10 top digit 4 → bit 29 set → negative (subtract 2^30).
    assert_eq!(parse_base_n_text("7777777777", 8, 10, 3), Ok(-1.0));
    assert_eq!(
        parse_base_n_text("4000000000", 8, 10, 3),
        Ok(-(1i64 << 29) as f64),
    );
    // HEX: 10 chars, 4 bits/digit (40-bit total). Case-insensitive.
    assert_eq!(parse_base_n_text("F", 16, 10, 4), Ok(15.0));
    assert_eq!(parse_base_n_text("ff", 16, 10, 4), Ok(255.0));
    assert_eq!(parse_base_n_text("FFFFFFFFFF", 16, 10, 4), Ok(-1.0));
    // Width-10 with top hex digit 8 → bit 39 set → most-negative.
    assert_eq!(
        parse_base_n_text("8000000000", 16, 10, 4),
        Ok(-(1i64 << 39) as f64),
    );
    assert_eq!(
        parse_base_n_text("G", 16, 10, 4),
        Err(ValueError::InvalidValue),
    );
}

#[test]
fn format_base_n_signed_boundaries() {
    // BIN: positive, min-width.
    assert_eq!(
        format_base_n_signed(0.0, 2, 10, 1, None, false).unwrap(),
        "0"
    );
    assert_eq!(
        format_base_n_signed(10.0, 2, 10, 1, None, false).unwrap(),
        "1010"
    );
    assert_eq!(
        format_base_n_signed(511.0, 2, 10, 1, None, false).unwrap(),
        "111111111"
    );
    // BIN: negative, full-width two's complement (places ignored).
    assert_eq!(
        format_base_n_signed(-1.0, 2, 10, 1, None, false).unwrap(),
        "1111111111"
    );
    assert_eq!(
        format_base_n_signed(-512.0, 2, 10, 1, None, false).unwrap(),
        "1000000000"
    );
    // places ignored for negatives — same output even with places=4.
    assert_eq!(
        format_base_n_signed(-1.0, 2, 10, 1, Some(4), false).unwrap(),
        "1111111111"
    );
    // places padding for positives.
    assert_eq!(
        format_base_n_signed(5.0, 2, 10, 1, Some(8), false).unwrap(),
        "00000101"
    );
    // places too small for the positive value → InvalidValue.
    assert_eq!(
        format_base_n_signed(10.0, 2, 10, 1, Some(3), false),
        Err(ValueError::InvalidValue),
    );
    // Out-of-range positive / negative → Overflow.
    assert_eq!(
        format_base_n_signed(512.0, 2, 10, 1, None, false),
        Err(ValueError::Overflow),
    );
    assert_eq!(
        format_base_n_signed(-513.0, 2, 10, 1, None, false),
        Err(ValueError::Overflow),
    );
    // OCT: positive, negative, padded.
    assert_eq!(
        format_base_n_signed(511.0, 8, 10, 3, None, false).unwrap(),
        "777"
    );
    assert_eq!(
        format_base_n_signed(-1.0, 8, 10, 3, None, false).unwrap(),
        "7777777777"
    );
    assert_eq!(
        format_base_n_signed(8.0, 8, 10, 3, Some(4), false).unwrap(),
        "0010"
    );
    // HEX uppercase / lowercase.
    assert_eq!(
        format_base_n_signed(255.0, 16, 10, 4, None, true).unwrap(),
        "FF"
    );
    assert_eq!(
        format_base_n_signed(-1.0, 16, 10, 4, None, true).unwrap(),
        "FFFFFFFFFF"
    );
    assert_eq!(
        format_base_n_signed(255.0, 16, 10, 4, Some(4), true).unwrap(),
        "00FF"
    );
    // places out of 1..=10 → InvalidValue.
    assert_eq!(
        format_base_n_signed(1.0, 2, 10, 1, Some(11), false),
        Err(ValueError::InvalidValue),
    );
    // Truncates fractional inputs toward zero.
    assert_eq!(
        format_base_n_signed(10.9, 2, 10, 1, None, false).unwrap(),
        "1010"
    );
    assert_eq!(
        format_base_n_signed(-1.5, 2, 10, 1, None, false).unwrap(),
        "1111111111"
    );
}
