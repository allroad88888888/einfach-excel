use super::*;

pub(super) fn asc_convert(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let code = c as u32;
        // 1. Full-width ASCII.
        if (0xFF01..=0xFF5E).contains(&code) {
            out.push(char::from_u32(code - 0xFEE0).unwrap_or(c));
            continue;
        }
        // 2. Ideographic space.
        if code == 0x3000 {
            out.push(' ');
            continue;
        }
        // 4. Excel's yen-sign quirk: U+FFE5 narrows to backslash.
        if code == 0xFFE5 {
            out.push('\\');
            continue;
        }
        // 3. Full-width katakana — table lookup, with voicing
        // decomposition for dakuten / handakuten pairs.
        if let Some((base, mark)) = fullwidth_kana_to_halfwidth(c) {
            out.push(base);
            if let Some(m) = mark {
                out.push(m);
            }
            continue;
        }
        // 5. Pass-through.
        out.push(c);
    }
    out
}

/// `JIS` / `DBCS` — widen half-width characters to full-width.
///
/// Mirror image of `asc_convert`:
///   1. ASCII (U+0021..U+007E) → full-width (U+FF01..U+FF5E) via `c + 0xFEE0`.
///   2. ASCII space U+0020 → ideographic space U+3000.
///   3. Half-width katakana U+FF61..U+FF9F → full-width katakana, composing
///      base + ﾞ (U+FF9E) into voiced kana and base + ﾟ (U+FF9F) into
///      semi-voiced kana when a valid pair appears.
///   4. Everything else passes through (notably backslash U+005C — see
///      the asymmetry note on `asc_convert`'s yen-sign quirk; we do NOT
///      widen U+005C back to U+FFE5 because the cycle would not be
///      stable for arbitrary text).
pub(super) fn jis_convert(s: &str) -> String {
    // Collect chars into a vec so we can look ahead by one for voicing
    // composition (we may need to consume two source chars to emit one).
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let code = c as u32;
        // 1. ASCII printable → full-width.
        if (0x21..=0x7E).contains(&code) {
            out.push(char::from_u32(code + 0xFEE0).unwrap_or(c));
            i += 1;
            continue;
        }
        // 2. ASCII space → ideographic space.
        if code == 0x20 {
            out.push('\u{3000}');
            i += 1;
            continue;
        }
        // 3. Half-width katakana, with optional voicing/semi-voicing
        // composition using the next char.
        if (0xFF61..=0xFF9F).contains(&code) {
            let next = chars.get(i + 1).copied();
            let (wide, consumed) = halfwidth_kana_to_fullwidth(c, next);
            out.push(wide);
            i += consumed;
            continue;
        }
        // 4. Pass-through.
        out.push(c);
        i += 1;
    }
    out
}
