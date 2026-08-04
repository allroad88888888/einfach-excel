pub(super) fn is_cjk_or_fullwidth(c: char) -> bool {
    let cp = c as u32;
    matches!(cp,
        0x3000..=0x303F   // CJK Symbols and Punctuation
        | 0x3040..=0x309F // Hiragana
        | 0x30A0..=0x30FF // Katakana
        | 0x3400..=0x4DBF // CJK Unified Ideographs Extension A
        | 0x4E00..=0x9FFF // CJK Unified Ideographs
        | 0xAC00..=0xD7AF // Hangul Syllables
        | 0xF900..=0xFAFF // CJK Compatibility Ideographs
        | 0xFF01..=0xFF60 // Full-width ASCII
        | 0xFFA0..=0xFFEF // Full-width Hangul Jamo etc.
    )
}

pub(super) fn dbcs_byte_width(c: char) -> usize {
    if is_cjk_or_fullwidth(c) {
        2
    } else {
        1
    }
}

pub(super) fn dbcs_byte_len(s: &str) -> usize {
    s.chars().map(dbcs_byte_width).sum()
}

pub(super) fn dbcs_take_left(s: &str, num_bytes: usize) -> String {
    let mut out = String::new();
    let mut used = 0usize;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        if used + w <= num_bytes {
            out.push(c);
            used += w;
        } else if used < num_bytes {
            out.push(' ');
            break;
        } else {
            break;
        }
    }
    out
}

pub(super) fn dbcs_take_right(s: &str, num_bytes: usize) -> String {
    let total = dbcs_byte_len(s);
    if num_bytes >= total {
        return s.to_string();
    }
    let target_start_byte = total - num_bytes;
    let mut out = String::new();
    let mut byte_off = 0usize;
    let mut leading_pad = false;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        let next = byte_off + w;
        if byte_off >= target_start_byte {
            out.push(c);
        } else if next > target_start_byte {
            leading_pad = true;
        }
        byte_off = next;
    }
    if leading_pad {
        let mut padded = String::with_capacity(out.len() + 1);
        padded.push(' ');
        padded.push_str(&out);
        padded
    } else {
        out
    }
}

pub(super) fn dbcs_mid(s: &str, start_byte: usize, num_bytes: usize) -> String {
    if num_bytes == 0 {
        return String::new();
    }
    let end_byte = start_byte + num_bytes - 1;
    let mut out = String::new();
    let mut byte_pos = 1usize;
    for c in s.chars() {
        let w = dbcs_byte_width(c);
        let first = byte_pos;
        let last = byte_pos + w - 1;
        if last < start_byte || first > end_byte {
            // outside the slice
        } else if first >= start_byte && last <= end_byte {
            out.push(c);
        } else {
            out.push(' ');
        }
        byte_pos += w;
        if byte_pos > end_byte {
            break;
        }
    }
    out
}
