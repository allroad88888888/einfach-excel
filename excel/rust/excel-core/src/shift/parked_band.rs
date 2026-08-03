//! 整列（`A:C`）与整行（`1:3`）范围记号在公式源码文本上的重写 —— 有界轴跟着
//! 编辑走，无界轴钉死不动，与 AST 侧 `retarget::shift_range_corners` 同一套规则。

use super::edit::{ShiftEdit, REF_INVALID_COL, REF_INVALID_ROW};
use super::parked_scan::{scan_abs_col_token, skip_ascii_ws};
use super::render::col_only;
use crate::cell::CellAddress;

/// Try to consume a `$`-aware whole-column range `[$]A:[$]C` starting at
/// `start`. `None` when the shape is not a whole-column range. `Some(Err)`
/// when a corner was deleted (DeadRef). `Some(Ok((new_i, rewrite)))`
/// otherwise, where `rewrite` is `Some(text)` when the columns moved (`$`
/// markers preserved). Mirrors the hydrated `shift_range_corners` +
/// `contains_invalid_ref` outcome for `RangeBounds::Rows`.
pub(super) fn try_shift_whole_col(
    b: &[u8],
    start: usize,
    edit: ShiftEdit,
) -> Option<Result<(usize, Option<String>), ()>> {
    let n = b.len();
    let (start_col, start_abs, after_start) = scan_abs_col_token(b, start)?;
    let j = skip_ascii_ws(b, after_start);
    if j >= n || b[j] != b':' {
        return None;
    }
    let j = skip_ascii_ws(b, j + 1);
    let (end_col, end_abs, after_end) = scan_abs_col_token(b, j)?;
    // `A:B3` — a trailing digit means the right corner was a cell address.
    if after_end < n && b[after_end].is_ascii_digit() {
        return None;
    }
    let m1 = edit.apply(CellAddress::new(0, start_col));
    let m2 = edit.apply(CellAddress::new(0, end_col));
    if m1.col == REF_INVALID_COL
        || m2.col == REF_INVALID_COL
        || (!edit.is_row_edit() && (m1.row == REF_INVALID_ROW || m2.row == REF_INVALID_ROW))
    {
        return Some(Err(()));
    }
    let rewrite = if !edit.is_row_edit() && (m1.col != start_col || m2.col != end_col) {
        let mut s = String::new();
        if start_abs {
            s.push('$');
        }
        s.push_str(&col_only(m1.col));
        s.push(':');
        if end_abs {
            s.push('$');
        }
        s.push_str(&col_only(m2.col));
        Some(s)
    } else {
        None
    };
    Some(Ok((after_end, rewrite)))
}

/// Try to consume a `$`-aware whole-row range `[$]1:[$]3` starting at
/// `start`. Same result contract as [`try_shift_whole_col`], for
/// `RangeBounds::Cols`. Mirrors `try_parse_whole_row_range`'s acceptance
/// rule (immediate `:`, digits both sides, end not followed by a letter).
pub(super) fn try_shift_whole_row(
    b: &[u8],
    start: usize,
    edit: ShiftEdit,
) -> Option<Result<(usize, Option<String>), ()>> {
    let n = b.len();
    let mut j = start;
    let start_abs = if j < n && b[j] == b'$' {
        j += 1;
        true
    } else {
        false
    };
    let s1 = j;
    while j < n && b[j].is_ascii_digit() {
        j += 1;
    }
    if j == s1 {
        return None;
    }
    let r1: u32 = std::str::from_utf8(&b[s1..j]).ok()?.parse().ok()?;
    // `:` must be immediate (no whitespace).
    if j >= n || b[j] != b':' {
        return None;
    }
    j += 1;
    let end_abs = if j < n && b[j] == b'$' {
        j += 1;
        true
    } else {
        false
    };
    let s2 = j;
    while j < n && b[j].is_ascii_digit() {
        j += 1;
    }
    if j == s2 {
        return None;
    }
    if j < n && b[j].is_ascii_alphabetic() {
        return None;
    }
    let r2: u32 = std::str::from_utf8(&b[s2..j]).ok()?.parse().ok()?;
    if r1 == 0 || r2 == 0 {
        return None;
    }
    let m1 = edit.apply(CellAddress::new(r1 - 1, 0));
    let m2 = edit.apply(CellAddress::new(r2 - 1, 0));
    if m1.row == REF_INVALID_ROW
        || m2.row == REF_INVALID_ROW
        || (edit.is_row_edit() && (m1.col == REF_INVALID_COL || m2.col == REF_INVALID_COL))
    {
        return Some(Err(()));
    }
    let rewrite = if edit.is_row_edit() && (m1.row != r1 - 1 || m2.row != r2 - 1) {
        let mut s = String::new();
        if start_abs {
            s.push('$');
        }
        s.push_str(&(m1.row + 1).to_string());
        s.push(':');
        if end_abs {
            s.push('$');
        }
        s.push_str(&(m2.row + 1).to_string());
        Some(s)
    } else {
        None
    };
    Some(Ok((j, rewrite)))
}
