//! 一个格子地址：怎么从 `A1` 这样的文本读进来，怎么写回去。
//!
//! **`[$]列[$]行` 的写出在本文件是唯一一份**（[`push_abs_col`] /
//! [`push_abs_row`] / [`push_abs_addr`]）。`shift/` 下的 AST 渲染与未解析
//! 源码重写此前各留了一份逐字节相同的拷贝，2026-08-03 收敛到这里；跨路径
//! 的逐字节一致由 `tests/abs_addr_single_source.rs` 钉死。
//!
//! 参数用两个裸 `bool` 而不是 `formula::RefAbs`：`formula` 依赖 `cell`，
//! 反过来会把依赖方向倒过来。语法树那侧的拆包放在
//! `shift::render::render_abs_addr` 里。

/// A cell address in a spreadsheet, e.g. "A1" → (row=0, col=0).
#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug)]
pub struct CellAddress {
    pub row: u32,
    pub col: u32,
}

impl CellAddress {
    pub fn new(row: u32, col: u32) -> Self {
        CellAddress { row, col }
    }

    /// Parse a cell reference like "A1", "B2", "AA100".
    /// Column letters are case-insensitive. Row numbers are 1-based.
    pub fn parse(s: &str) -> Option<CellAddress> {
        let s = s.trim();
        if s.is_empty() {
            return None;
        }

        // Split into letter part and number part
        let mut col_end = 0;
        for (i, c) in s.char_indices() {
            if c.is_ascii_alphabetic() {
                col_end = i + 1;
            } else {
                break;
            }
        }

        if col_end == 0 {
            return None; // no column letters
        }

        let col_str = &s[..col_end];
        let row_str = &s[col_end..];

        if row_str.is_empty() {
            return None; // no row number
        }

        let row_num: u32 = row_str.parse().ok()?;
        if row_num == 0 {
            return None; // row numbers are 1-based
        }

        let col = col_letters_to_index(col_str)?;

        Some(CellAddress {
            row: row_num - 1, // convert to 0-based
            col,
        })
    }

    /// Convert back to string representation like "A1".
    ///
    /// 就是 [`push_abs_addr`] 两个 `$` 都不加的那一档 —— 走同一份实现，
    /// 免得「有 `$`」和「没 `$`」两种写法各自漂移。
    pub fn to_string_repr(&self) -> String {
        let mut out = String::new();
        push_abs_addr(&mut out, *self, false, false);
        out
    }
}

impl std::fmt::Display for CellAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_string_repr())
    }
}

/// Convert column letters to 0-based index: "A"→0, "B"→1, ..., "Z"→25, "AA"→26
fn col_letters_to_index(s: &str) -> Option<u32> {
    let mut result: u32 = 0;
    for c in s.chars() {
        let digit = c.to_ascii_uppercase() as u32 - 'A' as u32;
        if digit > 25 {
            return None;
        }
        result = result * 26 + digit + 1;
    }
    Some(result - 1) // convert to 0-based
}

/// Convert 0-based column index to letters: 0→"A", 25→"Z", 26→"AA"
///
/// 保持私有：列名从来不单独出现在公式文本里，外面要的一直是「带不带 `$`
/// 的列写法」，那由 [`push_abs_col`] 提供。留个私有出口只会让 `shift/` 又
/// 绕过 `$` 这一层各写一遍。
fn col_index_to_letters(mut col: u32) -> String {
    let mut result = String::new();
    loop {
        result.push((b'A' + (col % 26) as u8) as char);
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    result.chars().rev().collect()
}

/// 把 0-based 列号按 `[$]列名` 写进 `out`：`(0, false)` → `A`，
/// `(26, true)` → `$AA`。
pub(crate) fn push_abs_col(out: &mut String, col: u32, abs: bool) {
    if abs {
        out.push('$');
    }
    out.push_str(&col_index_to_letters(col));
}

/// 把 0-based 行号按 `[$]行号` 写进 `out`，行号转回 1-based：
/// `(0, false)` → `1`，`(99, true)` → `$100`。
pub(crate) fn push_abs_row(out: &mut String, row: u32, abs: bool) {
    if abs {
        out.push('$');
    }
    out.push_str(&(row + 1).to_string());
}

/// 把一个地址按 `[$]列[$]行` 写进 `out`：`$A$1` / `$A1` / `A$1` / `A1`。
///
/// `$` 只是**写法**上的标注，不改坐标 —— 调用方拿到的行列号和
/// [`CellAddress::to_string_repr`] 里的完全一样。
///
/// 调用方须自己先挡掉 `#REF!` 哨兵（`shift::edit::REF_INVALID_ROW`
/// = `u32::MAX`）：本函数会算 `row + 1`，哨兵进来在 debug 构建下会溢出
/// panic。AST 侧由 `is_invalid` / `range_has_invalid_ref` 挡，未解析源码侧
/// 由 `rewrite_parked_source` 的 `DeadRef` 早退挡。
pub(crate) fn push_abs_addr(out: &mut String, addr: CellAddress, col_abs: bool, row_abs: bool) {
    push_abs_col(out, addr.col, col_abs);
    push_abs_row(out, addr.row, row_abs);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_a1() {
        let addr = CellAddress::parse("A1").unwrap();
        assert_eq!(addr.row, 0);
        assert_eq!(addr.col, 0);
    }

    #[test]
    fn parse_b2() {
        let addr = CellAddress::parse("B2").unwrap();
        assert_eq!(addr.row, 1);
        assert_eq!(addr.col, 1);
    }

    #[test]
    fn parse_z26() {
        let addr = CellAddress::parse("Z26").unwrap();
        assert_eq!(addr.row, 25);
        assert_eq!(addr.col, 25);
    }

    #[test]
    fn parse_aa1() {
        let addr = CellAddress::parse("AA1").unwrap();
        assert_eq!(addr.row, 0);
        assert_eq!(addr.col, 26);
    }

    #[test]
    fn parse_ab3() {
        let addr = CellAddress::parse("AB3").unwrap();
        assert_eq!(addr.row, 2);
        assert_eq!(addr.col, 27);
    }

    #[test]
    fn parse_case_insensitive() {
        let addr = CellAddress::parse("a1").unwrap();
        assert_eq!(addr.row, 0);
        assert_eq!(addr.col, 0);
    }

    #[test]
    fn parse_invalid_empty() {
        assert!(CellAddress::parse("").is_none());
    }

    #[test]
    fn parse_invalid_no_row() {
        assert!(CellAddress::parse("A").is_none());
    }

    #[test]
    fn parse_invalid_no_col() {
        assert!(CellAddress::parse("123").is_none());
    }

    #[test]
    fn parse_invalid_zero_row() {
        assert!(CellAddress::parse("A0").is_none());
    }

    #[test]
    fn roundtrip_a1() {
        let addr = CellAddress::new(0, 0);
        assert_eq!(addr.to_string_repr(), "A1");
        assert_eq!(CellAddress::parse("A1").unwrap(), addr);
    }

    #[test]
    fn roundtrip_aa1() {
        let addr = CellAddress::new(0, 26);
        assert_eq!(addr.to_string_repr(), "AA1");
        assert_eq!(CellAddress::parse("AA1").unwrap(), addr);
    }

    #[test]
    fn roundtrip_z100() {
        let addr = CellAddress::new(99, 25);
        assert_eq!(addr.to_string_repr(), "Z100");
        assert_eq!(CellAddress::parse("Z100").unwrap(), addr);
    }

    #[test]
    fn col_letters_large() {
        // AZ = 51
        let addr = CellAddress::parse("AZ1").unwrap();
        assert_eq!(addr.col, 51);
        assert_eq!(CellAddress::new(0, 51).to_string_repr(), "AZ1");
    }

    #[test]
    fn display_trait() {
        let addr = CellAddress::new(0, 0);
        assert_eq!(format!("{}", addr), "A1");
    }
}
