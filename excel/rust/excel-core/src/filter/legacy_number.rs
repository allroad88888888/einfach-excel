/// JavaScript's `WhiteSpace ∪ LineTerminator` production, which is what
/// `String.prototype.trim` and `Number(string)` both strip.
///
/// It is NOT `char::is_whitespace` (the Unicode `White_Space` property).
/// The two differ at exactly two code points:
///
///   - U+0085 NEXT LINE — `White_Space`, but NOT JavaScript whitespace.
///   - U+FEFF ZERO WIDTH NO-BREAK SPACE — JavaScript whitespace (it is
///     `<ZWNBSP>` in the spec), but NOT `White_Space`.
///
/// Both matter here: a BOM-prefixed `"\u{feff}Total"` label is a summary
/// row in the product today, and a NEL-prefixed `"\u{85}12"` is NOT the
/// number 12 today. Spelling the set out is how the port keeps both.
fn is_js_whitespace(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// JavaScript's `String.prototype.trim`.
pub fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_whitespace)
}

/// JavaScript's `Number(string)` composed with `Number.isFinite`, i.e. the
/// TypeScript `numericValue` helper (`projection-helpers.ts:82-85`):
///
/// ```ts
/// export function numericValue(text: string): number | null {
///   const value = Number(text)
///   return Number.isFinite(value) ? value : null
/// }
/// ```
///
/// `str::parse::<f64>()` is NOT a substitute, and the differences are not
/// academic — the first one fires on every empty cell in a filtered column:
///
/// | input        | `Number(x)` | `x.parse::<f64>()` |
/// |--------------|-------------|--------------------|
/// | `""`         | `0`         | `Err`              |
/// | `"  12  "`   | `12`        | `Err`              |
/// | `"0x10"`     | `16`        | `Err`              |
/// | `"0b101"`    | `5`         | `Err`              |
/// | `"Infinity"` | `∞` → `None`| `Err`              |
/// | `"inf"`      | `NaN` → `None` | `Ok(∞)`         |
/// | `"NaN"`      | `NaN` → `None` | `Ok(NaN)`       |
/// | `"1_000"`    | `NaN` → `None` | `Err`           |
///
/// The empty-string row is the one with product consequences: a `range`
/// rule whose band contains zero MATCHES every blank cell in the column
/// today. That is the behaviour being preserved, not endorsed.
///
/// Strategy: validate the JavaScript `StringNumericLiteral` grammar by
/// hand, then delegate the actual decimal-to-binary rounding to Rust's
/// `f64` parser, which is correctly rounded exactly like the JavaScript
/// one. Validation is what keeps `"inf"` / `"NaN"` / `"1_000"` out.
pub fn js_numeric_value(text: &str) -> Option<f64> {
    let value = js_number(text)?;
    if value.is_finite() {
        Some(value)
    } else {
        None
    }
}

/// `Number(string)` proper. `None` stands for `NaN` (the caller cannot
/// tell the difference, since `Number.isFinite(NaN)` is false anyway, but
/// keeping the split makes the grammar readable).
fn js_number(text: &str) -> Option<f64> {
    let s = js_trim(text);
    // `Number("")` and `Number("   ")` are +0, not NaN. This is the row of
    // the table above that actually changes what users see.
    if s.is_empty() {
        return Some(0.0);
    }

    if let Some(rest) = strip_radix_prefix(s, 'x', 'X') {
        return parse_radix(rest, 16);
    }
    if let Some(rest) = strip_radix_prefix(s, 'o', 'O') {
        return parse_radix(rest, 8);
    }
    if let Some(rest) = strip_radix_prefix(s, 'b', 'B') {
        return parse_radix(rest, 2);
    }

    let (negative, body) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };

    // `Infinity` is spelled exactly that way — case-sensitively, and only
    // that word. `inf`, `INFINITY` and `NaN` are all plain NaN in JS.
    if body == "Infinity" {
        return Some(if negative {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        });
    }
    if !is_js_decimal_literal(body) {
        return None;
    }
    let parsed: f64 = body.parse().ok()?;
    Some(if negative { -parsed } else { parsed })
}

fn strip_radix_prefix<'a>(s: &'a str, lower: char, upper: char) -> Option<&'a str> {
    let rest = s.strip_prefix('0')?;
    let mut chars = rest.chars();
    let marker = chars.next()?;
    if marker == lower || marker == upper {
        Some(chars.as_str())
    } else {
        None
    }
}

/// `NonDecimalIntegerLiteral`. No sign is permitted (`Number("-0x10")` is
/// NaN), and at least one digit is required (`Number("0x")` is NaN).
/// Accumulating in `f64` matches the spec's "mathematical value, then
/// rounded" only up to 2^53; beyond that the last ulp can differ. Cells
/// whose DISPLAY string is a >53-bit hex literal are not a shape this
/// product produces, and the alternative — arbitrary-precision integer
/// parsing — would be a lot of machinery for that.
fn parse_radix(digits: &str, radix: u32) -> Option<f64> {
    if digits.is_empty() {
        return None;
    }
    let mut acc = 0f64;
    for c in digits.chars() {
        let d = c.to_digit(radix)?;
        acc = acc * f64::from(radix) + f64::from(d);
    }
    Some(acc)
}

/// The unsigned `StrUnsignedDecimalLiteral` grammar minus `Infinity`:
/// `digits[.digits][e[±]digits]`, `.digits[e[±]digits]`, or
/// `digits.[e[±]digits]`. At least one mantissa digit; a bare `"."`,
/// a dangling `"1e"` and an underscore-separated `"1_000"` are all NaN.
fn is_js_decimal_literal(body: &str) -> bool {
    let bytes = body.as_bytes();
    let mut i = 0;
    let mut mantissa_digits = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
        mantissa_digits += 1;
    }
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
            mantissa_digits += 1;
        }
    }
    if mantissa_digits == 0 {
        return false;
    }
    if i == bytes.len() {
        return true;
    }
    if bytes[i] != b'e' && bytes[i] != b'E' {
        return false;
    }
    i += 1;
    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }
    let exponent_start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    i > exponent_start && i == bytes.len()
}

