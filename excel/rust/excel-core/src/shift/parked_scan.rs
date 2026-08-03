//! 公式源码字节流上的记号识别：给一个字节位置，回答「这里起头的记号是什么、
//! 到哪里结束」。
//!
//! 本文件的函数一律不认识 [`ShiftEdit`](super::edit::ShiftEdit) —— 它们只认
//! 记号，不判断记号该不该动。

use crate::cell::CellAddress;

/// Identifier scan mirroring `Parser::parse_identifier`: alphanumerics
/// and `_`, with `.` absorbed only when followed by another identifier
/// char. `i` must point at the (alphabetic) first char.
pub(super) fn scan_ident_end(b: &[u8], mut i: usize) -> usize {
    while i < b.len() {
        let c = b[i];
        if c.is_ascii_alphanumeric() || c == b'_' {
            i += 1;
        } else if c == b'.'
            && i + 1 < b.len()
            && (b[i + 1].is_ascii_alphanumeric() || b[i + 1] == b'_')
        {
            i += 1;
        } else {
            break;
        }
    }
    i
}

pub(super) fn skip_ascii_ws(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t' || b[i] == b'\r' || b[i] == b'\n') {
        i += 1;
    }
    i
}

pub(super) fn next_non_ws(b: &[u8], i: usize) -> Option<u8> {
    let j = skip_ascii_ws(b, i);
    b.get(j).copied()
}

/// Overflow-safe column-letter parse (`CellAddress::parse`'s
/// `col_letters_to_index` does unchecked arithmetic, which would panic
/// in debug builds on absurd letter runs in garbage sources — the
/// scanner runs over EVERY parked source on EVERY structural edit, so
/// it must never panic on hostile text).
fn parse_col_letters(s: &str) -> Option<u32> {
    if s.is_empty() {
        return None;
    }
    let mut result: u32 = 0;
    for c in s.bytes() {
        if !c.is_ascii_alphabetic() {
            return None;
        }
        let d = (c.to_ascii_uppercase() - b'A') as u32;
        result = result.checked_mul(26)?.checked_add(d + 1)?;
    }
    result.checked_sub(1)
}

/// Parse a `[$]col[$]row` cell-address token at byte index `i` (which must
/// point at `$` or an ascii letter). Returns `(addr, col_abs, row_abs, end)`
/// only when the token is a self-delimited cell address — mirroring
/// `Parser::scan_abs_cell_addr`, boundary check included, so `A1B` / `A1.5`
/// are NOT treated as addresses. Overflow-safe (runs over hostile parked
/// text). Returns `None` otherwise.
pub(super) fn scan_abs_addr_token(b: &[u8], i: usize) -> Option<(CellAddress, bool, bool, usize)> {
    let n = b.len();
    let mut j = i;
    let col_abs = if j < n && b[j] == b'$' {
        j += 1;
        true
    } else {
        false
    };
    let letters_start = j;
    while j < n && b[j].is_ascii_alphabetic() {
        j += 1;
    }
    if j == letters_start {
        return None;
    }
    let col = parse_col_letters(std::str::from_utf8(&b[letters_start..j]).ok()?)?;
    let row_abs = if j < n && b[j] == b'$' {
        j += 1;
        true
    } else {
        false
    };
    let digits_start = j;
    while j < n && b[j].is_ascii_digit() {
        j += 1;
    }
    if j == digits_start {
        return None;
    }
    // Boundary: the token must not run into a longer identifier.
    if j < n {
        let d = b[j];
        if d.is_ascii_alphanumeric() || d == b'_' {
            return None;
        }
        if d == b'.' && j + 1 < n && (b[j + 1].is_ascii_alphanumeric() || b[j + 1] == b'_') {
            return None;
        }
    }
    let row: u32 = std::str::from_utf8(&b[digits_start..j])
        .ok()?
        .parse()
        .ok()?;
    if row == 0 {
        return None;
    }
    Some((CellAddress::new(row - 1, col), col_abs, row_abs, j))
}

/// Scan a `[$]letters` whole-column corner at `i`. Returns `(col, col_abs,
/// end)`. Overflow-safe. `None` when no letters are present.
pub(super) fn scan_abs_col_token(b: &[u8], i: usize) -> Option<(u32, bool, usize)> {
    let n = b.len();
    let mut j = i;
    let col_abs = if j < n && b[j] == b'$' {
        j += 1;
        true
    } else {
        false
    };
    let s = j;
    while j < n && b[j].is_ascii_alphabetic() {
        j += 1;
    }
    if j == s {
        return None;
    }
    let col = parse_col_letters(std::str::from_utf8(&b[s..j]).ok()?)?;
    Some((col, col_abs, j))
}
