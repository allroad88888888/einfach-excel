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

/// 跳过一个 `'…'` 带引号表名（`i` 必须指向开引号），返回**闭合引号之后**的
/// 位置；引号未闭合返回 `None`。
///
/// 语义逐条对齐 AST 侧的 `formula::quoted_name::Parser::scan_quoted_name`：
///
///   - `''` 是转义的单引号，不是闭合 —— `'It''s'` 是一个完整名字；
///   - 引号内不做任何其它解释，空格 / `!` / `:` / 非 ASCII 全是名字的一部分，
///     所以 `'A!B'!A1` 的分隔符是**闭合引号之后**那个 `!`；
///   - 未闭合即失败（AST 侧整条公式解析不出来，两条路径同为 `#VALUE!`）。
///
/// **不吃闭合引号后面的 `!`**：那个 `!` 要原样留给主循环，跨表守卫靠
/// `prev == b'!'` 认出它后面那截属于别的表（见 [`scan_cross_sheet_ref_end`]）。
///
/// 未闭合时刻意**不**像字符串字面量那样吞到结尾：调用点只把这个 `'` 当普通
/// 标点前进一字节，半截输入后面的字节照旧参与扫描，一个漂着的 `'` 不会让整条
/// 尾巴失去改写。
///
/// 按字节扫是安全的：只与 ASCII `'`（0x27）比较，而 UTF-8 多字节序列里不会
/// 出现 < 0x80 的字节，所以字节游标与 AST 侧的字符游标停在同一批边界上。
/// 与 AST 侧只对齐**语义**不共用实现：那边是 `&mut Parser` 上的字符游标、
/// 要分配出解转义后的 `String`，而这里每次结构编辑都要扫过**每一条**停泊源码，
/// 只问「到哪结束」、一个字节都不分配。
pub(super) fn scan_quoted_name_end(b: &[u8], i: usize) -> Option<usize> {
    let n = b.len();
    let mut j = i + 1; // 越过开引号
    while j < n {
        if b[j] != b'\'' {
            j += 1;
            continue;
        }
        if j + 1 < n && b[j + 1] == b'\'' {
            j += 2; // `''`：转义的单引号，继续读
            continue;
        }
        return Some(j + 1);
    }
    None
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

/// `Sheet!` 之后那截引用**结束在哪** —— `i` 指向 `!` 的下一个字节。
///
/// 调用点拿它把整个跨表引用一次跳过：本表的结构性编辑不移动跨表引用，这与
/// AST 侧 `delta` / `retarget` 里 `SheetRange => expr.clone()` 是同一条规则，
/// 停泊态只是换了个介质表达它。
///
/// 认的三种形态与 `formula::refs::finish_sheet_qualified_ref` 一一对应：
/// 有界的 `A1` / `A1:B2`、整列 `A:C`、整行 `1:3`（都带 `$` 变体）。
///
/// `None` 表示 `!` 之后不是静态引用 —— 例如 `Sheet2!A1:INDEX(...)` 的算出来
/// 的右角。调用点让它落回普通扫描，藏在里面的**同表**引用因此照样平移。
pub(super) fn scan_cross_sheet_ref_end(b: &[u8], i: usize) -> Option<usize> {
    let n = b.len();
    // 有界形态：`A1`，再看有没有 `:B2` 尾巴。
    if let Some((_, _, _, end)) = scan_abs_addr_token(b, i) {
        let j = skip_ascii_ws(b, end);
        if j < n && b[j] == b':' {
            let jj = skip_ascii_ws(b, j + 1);
            if let Some((_, _, _, end2)) = scan_abs_addr_token(b, jj) {
                return Some(end2);
            }
        }
        return Some(end);
    }
    // 整列 `A:C`。右角后面跟数字说明那是 `A:B3`（右角其实是个地址），不收。
    if let Some((_, _, after_start)) = scan_abs_col_token(b, i) {
        let j = skip_ascii_ws(b, after_start);
        if j < n && b[j] == b':' {
            let jj = skip_ascii_ws(b, j + 1);
            if let Some((_, _, end)) = scan_abs_col_token(b, jj) {
                if !(end < n && b[end].is_ascii_digit()) {
                    return Some(end);
                }
            }
        }
        return None;
    }
    // 整行 `1:3`。接受规则照抄 `try_shift_whole_row`：`:` 必须紧邻（不跳
    // 空白），两侧都是数字串，右角后面不能跟字母。
    let after_start = scan_abs_row_token(b, i)?;
    if after_start >= n || b[after_start] != b':' {
        return None;
    }
    let end = scan_abs_row_token(b, after_start + 1)?;
    if end < n && b[end].is_ascii_alphabetic() {
        return None;
    }
    Some(end)
}

/// Scan a `[$]digits` whole-row corner at `i`, returning the end offset.
/// `None` when no digits are present.
fn scan_abs_row_token(b: &[u8], i: usize) -> Option<usize> {
    let n = b.len();
    let mut j = i;
    if j < n && b[j] == b'$' {
        j += 1;
    }
    let s = j;
    while j < n && b[j].is_ascii_digit() {
        j += 1;
    }
    if j == s {
        return None;
    }
    Some(j)
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
