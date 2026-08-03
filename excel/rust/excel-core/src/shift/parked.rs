//! 在**未解析**（parked）的公式源码文本上，把被本次结构编辑移动的引用记号
//! 换成新写法。

use super::edit::{ShiftEdit, REF_INVALID_COL, REF_INVALID_ROW};
use super::parked_band::{try_shift_whole_col, try_shift_whole_row};
use super::parked_scan::{
    next_non_ws, scan_abs_addr_token, scan_cross_sheet_ref_end, scan_ident_end,
};
use crate::cell::push_abs_addr;

/// Outcome of `rewrite_parked_source` for one parked formula source.
#[derive(Debug, PartialEq, Eq)]
pub enum SourceRewrite {
    /// No reference crosses the edit boundary — source text reusable as-is.
    Unchanged,
    /// At least one reference shifted; the rewritten source is returned.
    Rewritten(String),
    /// A reference fell inside the deleted band. Mirrors the hydrated
    /// path: the whole formula becomes a `#REF!` error cell.
    DeadRef,
}

/// AUDIT A-1 — token-level A1-reference rewrite for LAZY (parked)
/// formula sources. Structural edits must retarget parked formulas
/// WITHOUT hydrating them (no parse, no dep install); this scanner
/// rewrites only the reference tokens the edit actually moves, in one
/// pass over the source bytes, allocating only when something changes.
///
/// The scanner mirrors `parse_formula`'s tokenization rules exactly so
/// that `hydrate(rewrite(src))` ≡ `retarget(hydrate(src))`:
///
///   - String literals (`"..."`, no escape support — same as
///     `Parser::parse_string`) are skipped verbatim, so `="A1"` is
///     never rewritten.
///   - Identifier tokens follow `Parser::parse_identifier`:
///     `[A-Za-z][A-Za-z0-9_]*` with `.` absorbed only when the next
///     char is another identifier char (so `RANK.EQ` is one token and
///     never mistaken for a ref).
///   - A token followed (whitespace allowed) by `(` is a function call
///     — `LOG10(`, `ATAN2(`, and even `A1(...)` (which the parser
///     treats as a FuncCall named `A1`, not a ref) are never shifted.
///   - A token followed (whitespace allowed) by `!` is a sheet name;
///     the address token immediately after the `!` — plus an optional
///     `:end` range tail that parses as an address — belongs to a
///     `SheetRef` / `SheetRange`, which within-sheet structural edits
///     do NOT shift (mirrors `map_addrs`). Cross-sheet retarget scope
///     is unchanged from the hydrated path: edits on this sheet never
///     rewrite other sheets' formulas either.
///   - A token that parses as a cell address is shifted through
///     `ShiftEdit::apply`. Bounded range corners (`A1:B5`) are two
///     independent tokens, exactly like `shift_range_corners` with
///     `RangeBounds::None`.
///   - Whole-column (`A:C`) / whole-row (`1:3`) ranges replicate
///     `shift_range_corners`' synthetic-corner trick: the bounded axis
///     shifts, the unbounded axis is pinned — and a corner mapped into
///     the deleted band (e.g. `delete_col(0)` under `=SUM(1:3)`) kills
///     the formula, matching the hydrated `contains_invalid_ref` path.
///   - Absolute refs (`$A$1`, `$A1`, `A$1`, and the range / whole-col /
///     whole-row forms) are shifted exactly like their relative twins —
///     the address moves, the `$` markers are preserved — mirroring the
///     hydrated `map_addrs` path (absoluteness never changes how an edit
///     moves an address). Quoted sheet names (`'My Sheet'!A1`) still do
///     not exist in this grammar, so the scanner doesn't model them.
///
/// Sources that don't parse (possible via `bulk_install_storage`,
/// which parks without validating) still surface `#VALUE!` at
/// hydration after a rewrite — token rewrites inside garbage can't
/// make garbage parse. The caller is expected to parse-check before
/// honoring `DeadRef` so unparseable sources keep the hydrated path's
/// `#VALUE!` outcome instead of gaining a `#REF!`.
pub fn rewrite_parked_source(src: &str, edit: ShiftEdit) -> SourceRewrite {
    let b = src.as_bytes();
    let n = b.len();
    // Output buffer, allocated lazily on the first actual rewrite.
    // `emitted` is the source index up to which output (or implicit
    // unchanged prefix) is already accounted for.
    let mut out: Option<String> = None;
    let mut emitted = 0usize;
    let mut i = 0usize;
    // Raw previous byte (0 at start). `prev == b'!'` marks the token
    // that immediately follows a sheet-name bang — the parser reads
    // that address with NO whitespace skip, so raw adjacency is right.
    let mut prev: u8 = 0;

    while i < n {
        let c = b[i];
        if c == b'"' {
            // String literal: skip to the closing quote (parser has no
            // escape sequence — first `"` closes).
            i += 1;
            while i < n && b[i] != b'"' {
                i += 1;
            }
            if i < n {
                i += 1;
            }
            prev = b'"';
            continue;
        }
        // A token that immediately follows a sheet `!` is a cross-sheet
        // reference (SheetRef / SheetRange). Within-sheet edits never shift
        // those (mirrors `map_addrs`), so skip the whole tail — bounded
        // corner(s) `A1[:B2]`, whole-column `A:C`, or whole-row `1:3`.
        // A non-reference after `!` (a DynamicRange end) falls through so
        // its inner refs still shift.
        //
        // 这一支必须**在按首字符分流之前**：整行形态 `Sheet2!1:3` 以数字开头，
        // 留在字母 / `$` 那一支里就漏掉了，本表插行会把它错误改写成 `2:4`。
        if prev == b'!' {
            if let Some(end) = scan_cross_sheet_ref_end(b, i) {
                i = end;
                prev = b[i - 1];
                continue;
            }
        }
        if c == b'$' || c.is_ascii_alphabetic() {
            if c.is_ascii_alphabetic() {
                let start = i;
                i = scan_ident_end(b, i);
                match next_non_ws(b, i) {
                    Some(b'(') | Some(b'!') => {
                        // Function name or sheet name — never a same-sheet ref.
                        prev = b[i - 1];
                        continue;
                    }
                    _ => {}
                }
                // Same-sheet cell ref (`A5`, `A$5`), `$`-aware on the row.
                if let Some((addr, col_abs, row_abs, end)) = scan_abs_addr_token(b, start) {
                    let mapped = edit.apply(addr);
                    if mapped.row == REF_INVALID_ROW || mapped.col == REF_INVALID_COL {
                        return SourceRewrite::DeadRef;
                    }
                    if mapped != addr {
                        let buf = out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                        buf.push_str(&src[emitted..start]);
                        push_abs_addr(buf, mapped, col_abs, row_abs);
                        emitted = end;
                    }
                    i = end;
                    prev = b[i - 1];
                    continue;
                }
                // Whole-column range `A:C` / `A:$C` (start column has no `$`
                // on this path — a leading `$` routes through the `$` arm).
                if let Some(res) = try_shift_whole_col(b, start, edit) {
                    match res {
                        Err(()) => return SourceRewrite::DeadRef,
                        Ok((new_i, rewrite)) => {
                            if let Some(text) = rewrite {
                                let buf =
                                    out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                                buf.push_str(&src[emitted..start]);
                                buf.push_str(&text);
                                emitted = new_i;
                            }
                            i = new_i;
                            prev = b[i - 1];
                            continue;
                        }
                    }
                }
                // Plain Name / TRUE / FALSE / error-literal letters — copy.
                prev = b[i - 1];
                continue;
            }

            // c == b'$': a leading `$` always introduces a reference
            // (never a function / sheet / Name).
            let start = i;
            if let Some((addr, col_abs, row_abs, end)) = scan_abs_addr_token(b, start) {
                let mapped = edit.apply(addr);
                if mapped.row == REF_INVALID_ROW || mapped.col == REF_INVALID_COL {
                    return SourceRewrite::DeadRef;
                }
                if mapped != addr {
                    let buf = out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                    buf.push_str(&src[emitted..start]);
                    push_abs_addr(buf, mapped, col_abs, row_abs);
                    emitted = end;
                }
                i = end;
                prev = b[i - 1];
                continue;
            }
            if let Some(res) = try_shift_whole_col(b, start, edit) {
                match res {
                    Err(()) => return SourceRewrite::DeadRef,
                    Ok((new_i, rewrite)) => {
                        if let Some(text) = rewrite {
                            let buf =
                                out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                            buf.push_str(&src[emitted..start]);
                            buf.push_str(&text);
                            emitted = new_i;
                        }
                        i = new_i;
                        prev = b[i - 1];
                        continue;
                    }
                }
            }
            if let Some(res) = try_shift_whole_row(b, start, edit) {
                match res {
                    Err(()) => return SourceRewrite::DeadRef,
                    Ok((new_i, rewrite)) => {
                        if let Some(text) = rewrite {
                            let buf =
                                out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                            buf.push_str(&src[emitted..start]);
                            buf.push_str(&text);
                            emitted = new_i;
                        }
                        i = new_i;
                        prev = b[i - 1];
                        continue;
                    }
                }
            }
            // Lone `$` (not part of a reference) — copy through.
            prev = b'$';
            i += 1;
            continue;
        }
        if c.is_ascii_digit() && prev != b'.' {
            // Candidate whole-row range `1:3` / `1:$3`. A leading `$` on the
            // first corner routes through the `$` arm above.
            let start = i;
            if let Some(res) = try_shift_whole_row(b, start, edit) {
                match res {
                    Err(()) => return SourceRewrite::DeadRef,
                    Ok((new_i, rewrite)) => {
                        if let Some(text) = rewrite {
                            let buf =
                                out.get_or_insert_with(|| String::with_capacity(src.len() + 8));
                            buf.push_str(&src[emitted..start]);
                            buf.push_str(&text);
                            emitted = new_i;
                        }
                        i = new_i;
                        prev = b[i - 1];
                        continue;
                    }
                }
            }
            // Not a whole-row range — copy the leading digit run through.
            while i < n && b[i].is_ascii_digit() {
                i += 1;
            }
            prev = b[i - 1];
            continue;
        }
        // Punctuation / whitespace / multibyte UTF-8 — copy through.
        prev = c;
        i += 1;
    }

    match out {
        None => SourceRewrite::Unchanged,
        Some(mut buf) => {
            buf.push_str(&src[emitted..]);
            SourceRewrite::Rewritten(buf)
        }
    }
}

#[cfg(test)]
#[path = "parked_tests.rs"]
mod tests;
