use super::*;

pub(crate) fn parse_base_n_text(
    text: &str,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
) -> Result<f64, ValueError> {
    if text.is_empty() || text.len() > max_chars {
        return Err(ValueError::InvalidValue);
    }
    let mut value: u64 = 0;
    for ch in text.chars() {
        let d = match ch.to_digit(base) {
            Some(d) => d as u64,
            None => return Err(ValueError::InvalidValue),
        };
        value = value * base as u64 + d;
    }
    let bits = (max_chars as u32) * bits_per_digit;
    // Sign-extend only when the input occupies the full width; shorter
    // strings are positive by definition (matching Excel: BIN2DEC("1")
    // is 1, not -1).
    if text.len() == max_chars {
        let sign_bit = 1u64 << (bits - 1);
        if value & sign_bit != 0 {
            let two_pow_n = 1u64 << bits;
            // value - 2^bits as a signed quantity.
            let signed = value as i64 - two_pow_n as i64;
            return Ok(signed as f64);
        }
    }
    Ok(value as f64)
}

/// Format a number into Excel's fixed-width signed two's-complement
/// textual base-n representation.
///
/// Positive (or zero) values: emit the minimum-width base-n digits,
/// optionally left-padded with `'0'` to `places`. `places` must satisfy
/// `1 <= places <= max_chars` and `places >= min_chars`; otherwise
/// `InvalidValue`.
///
/// Negative values: emit exactly `max_chars` digits (the two's-comp
/// representation); `places` is ignored, matching Excel.
///
/// Out-of-range numbers surface `Overflow` (Excel's `#NUM!`). The
/// argument is truncated toward zero before range-checking.
pub(crate) fn format_base_n_signed(
    value: f64,
    base: u32,
    max_chars: usize,
    bits_per_digit: u32,
    places: Option<usize>,
    upper_hex: bool,
) -> Result<String, ValueError> {
    if !value.is_finite() {
        return Err(ValueError::Overflow);
    }
    // Excel truncates toward zero before applying the range check.
    let trunc = value.trunc();
    let bits = (max_chars as u32) * bits_per_digit;
    let max_pos: i64 = (1i64 << (bits - 1)) - 1;
    let min_neg: i64 = -(1i64 << (bits - 1));
    // Guard against trunc that doesn't fit in i64 before casting.
    if trunc > max_pos as f64 || trunc < min_neg as f64 {
        return Err(ValueError::Overflow);
    }
    let v = trunc as i64;

    let digit_char = |d: u32| -> char {
        let c = char::from_digit(d, base).unwrap_or('0');
        if upper_hex {
            c.to_ascii_uppercase()
        } else {
            c
        }
    };

    if v < 0 {
        // Two's-complement: encode (v + 2^bits) as an unsigned value
        // and emit exactly `max_chars` digits, padded with leading
        // zeros if the high digits are zero (rare since the sign bit
        // is set by definition for in-range negatives).
        let two_pow_n: u64 = 1u64 << bits;
        let unsigned = (v as i64 + two_pow_n as i64) as u64;
        let mut out = String::with_capacity(max_chars);
        let mut buf = unsigned;
        for _ in 0..max_chars {
            let d = (buf % base as u64) as u32;
            out.push(digit_char(d));
            buf /= base as u64;
        }
        Ok(out.chars().rev().collect())
    } else {
        // Build the minimum-width unsigned representation.
        let mut buf = v as u64;
        let min_chars: String = if buf == 0 {
            "0".to_string()
        } else {
            let mut s = String::new();
            while buf > 0 {
                let d = (buf % base as u64) as u32;
                s.push(digit_char(d));
                buf /= base as u64;
            }
            s.chars().rev().collect()
        };
        match places {
            None => Ok(min_chars),
            Some(p) => {
                if p < 1 || p > max_chars {
                    return Err(ValueError::InvalidValue);
                }
                if p < min_chars.len() {
                    return Err(ValueError::InvalidValue);
                }
                let pad = p - min_chars.len();
                let mut out = String::with_capacity(p);
                for _ in 0..pad {
                    out.push('0');
                }
                out.push_str(&min_chars);
                Ok(out)
            }
        }
    }
}
