//! 公式文本的词法扫描器：从游标当前位置认出一个记号。
//!
//! 只做「字符流 → 单个记号」，不认识优先级、也不组装子树 —— 语法在
//! `operators` / `primary` 那几片。游标 [`Parser`] 住在这里，因为它
//! 就是扫描位置；语法层做推测性解析时存档再恢复 `pos`，用的是同一份
//! 位置语义。

use crate::cell::CellAddress;
use einfach_core::ValueError;

use super::ast::{Expr, RefAbs};

pub(super) struct Parser {
    pub(super) chars: Vec<char>,
    pub(super) pos: usize,
}

impl Parser {
    pub(super) fn new(input: &str) -> Self {
        Parser {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    pub(super) fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    pub(super) fn advance(&mut self) -> Option<char> {
        let c = self.chars.get(self.pos).copied()?;
        self.pos += 1;
        Some(c)
    }

    pub(super) fn skip_whitespace(&mut self) {
        while let Some(c) = self.peek() {
            if c.is_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    pub(super) fn expect(&mut self, expected: char) -> Option<()> {
        self.skip_whitespace();
        if self.peek() == Some(expected) {
            self.advance();
            Some(())
        } else {
            None
        }
    }

    pub(super) fn peek_at(&self, offset: usize) -> Option<char> {
        self.chars.get(self.pos + offset).copied()
    }

    pub(super) fn consume_dollar(&mut self) -> bool {
        if self.peek() == Some('$') {
            self.advance();
            true
        } else {
            false
        }
    }

    /// True if the current position continues an identifier token — an
    /// alphanumeric / `_`, or a `.` that is itself followed by an identifier
    /// char (the dotted-function-name rule). Used as the trailing boundary
    /// for a cell-address token so `A1B` / `A1.5` stay bare Names rather than
    /// being split into `A1` + trailing garbage.
    fn at_ident_continuation(&self) -> bool {
        match self.peek() {
            Some(c) if c.is_ascii_alphanumeric() || c == '_' => true,
            Some('.') => {
                matches!(self.peek_at(1), Some(n) if n.is_ascii_alphanumeric() || n == '_')
            }
            _ => false,
        }
    }

    /// Scan a `[$]col[$]row` cell address at the current position, recording
    /// which axes carried a `$`. Contiguous (no interior whitespace). On any
    /// failure — including a token that runs into a longer identifier
    /// (`A1B`) — the position is restored and `None` is returned, so the
    /// caller can fall through to whole-column / Name handling. Equivalent to
    /// "the whole leading token is a valid cell address" for the relative
    /// case, so it is a drop-in replacement for the old
    /// `CellAddress::parse(&ident)` path plus `$` support.
    pub(super) fn scan_abs_cell_addr(&mut self) -> Option<(CellAddress, RefAbs)> {
        let save = self.pos;
        let col_abs = self.consume_dollar();
        let letters_start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_alphabetic()) {
            self.advance();
        }
        if self.pos == letters_start {
            self.pos = save;
            return None;
        }
        let letters: String = self.chars[letters_start..self.pos].iter().collect();
        let row_abs = self.consume_dollar();
        let digits_start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
            self.advance();
        }
        if self.pos == digits_start {
            self.pos = save;
            return None;
        }
        if self.at_ident_continuation() {
            // e.g. `A1B` / `A1.5` — not a self-delimited address.
            self.pos = save;
            return None;
        }
        let digits: String = self.chars[digits_start..self.pos].iter().collect();
        match CellAddress::parse(&format!("{}{}", letters, digits)) {
            Some(addr) => Some((addr, RefAbs::new(col_abs, row_abs))),
            None => {
                self.pos = save;
                None
            }
        }
    }

    /// Scan a `[$]col` whole-column corner (letters with an optional leading
    /// `$`, NO row digits). Returns the 0-based column index and its `$`
    /// marker. Restores the position and returns `None` on failure.
    pub(super) fn scan_abs_col(&mut self) -> Option<(u32, bool)> {
        let save = self.pos;
        let col_abs = self.consume_dollar();
        let letters_start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_alphabetic()) {
            self.advance();
        }
        if self.pos == letters_start {
            self.pos = save;
            return None;
        }
        let letters: String = self.chars[letters_start..self.pos].iter().collect();
        // Reuse the column parser via a synthetic `<letters>1` address.
        match CellAddress::parse(&format!("{}1", letters)) {
            Some(a) => Some((a.col, col_abs)),
            None => {
                self.pos = save;
                None
            }
        }
    }

    pub(super) fn matches_literal(&self, token: &str) -> bool {
        let mut offset = 0;
        for expected in token.chars() {
            let Some(actual) = self.chars.get(self.pos + offset).copied() else {
                return false;
            };
            if !actual.eq_ignore_ascii_case(&expected) {
                return false;
            }
            offset += 1;
        }
        true
    }

    /// Error literals accepted inside formula text (`=IF(A1,#N/A,1)`).
    ///
    /// This table is the INVERSE OF `Display`, not of `format::
    /// error_display_token`. Those two diverge on exactly two tokens:
    /// `WrongType` and `WrongArgCount` render to users as `#VALUE!` (Excel
    /// has neither `#TYPE!` nor `#ARGS!`) while they still *serialize* as
    /// `#TYPE!` / `#ARGS!`, because `shift::render_formula` writes
    /// `Expr::Error` out via `to_string` whenever a structural edit rewrites
    /// a formula. Drop either row and that rewrite stops round-tripping: a
    /// stored `=IF(A1,#TYPE!,1)` would come back as a `#NAME?` fragment after
    /// the next row insert. Persisted workbooks and `set_error("#ARGS!")`
    /// hosts have the same requirement.
    ///
    /// So both rows stay. They are parse-only aliases now — nothing in the
    /// engine ever asks the user to type them, and nothing shows them back
    /// to them — and that asymmetry is deliberate: a serialization format
    /// may be wider than the display vocabulary, never narrower.
    pub(super) fn parse_error_literal(&mut self) -> Option<Expr> {
        let tokens = [
            ("#DIV/0!", ValueError::DivisionByZero),
            ("#VALUE!", ValueError::InvalidValue),
            ("#NAME?", ValueError::InvalidName),
            ("#SPILL!", ValueError::Spill),
            ("#CALC!", ValueError::Calc),
            ("#NULL!", ValueError::Null),
            ("#CYCLE!", ValueError::CyclicRef),
            // Parse-only aliases; both render back to users as `#VALUE!`.
            // See the doc comment above before touching these two rows.
            ("#TYPE!", ValueError::WrongType),
            ("#ARGS!", ValueError::WrongArgCount),
            ("#BUSY!", ValueError::Busy),
            ("#REF!", ValueError::InvalidRef),
            ("#NUM!", ValueError::Overflow),
            ("#N/A", ValueError::NotAvailable),
        ];
        for (token, err) in tokens {
            if self.matches_literal(token) {
                self.pos += token.chars().count();
                return Some(Expr::Error(err));
            }
        }
        None
    }

    pub(super) fn parse_number(&mut self) -> Option<Expr> {
        let start = self.pos;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '.' {
                self.advance();
            } else {
                break;
            }
        }
        self.consume_exponent_suffix();
        let s: String = self.chars[start..self.pos].iter().collect();
        let n: f64 = s.parse().ok()?;
        if !n.is_finite() {
            // `2E308` / 320 个 9 —— Rust 的 `parse::<f64>()` 对溢出返回
            // `Ok(inf)`，不像 JS 的 `Number()` 那样还能被 `isFinite` 挡在
            // 外面。这里补上同一道闸门，否则单元格会显示 `Infinity`，那是
            // 两个引擎都给不出的答案。TS 侧对应 `readNumber` 结尾的
            // `if (!Number.isFinite(value)) return null`。
            return None;
        }
        Some(Expr::Number(n))
    }

    /// 尾数之后的科学计数后缀。形状必须是 `[eE] [+-]? digit+`，**至少一位**
    /// 指数数字；不满足就一个字符都不消费。
    ///
    /// 这是 `E2` 的消歧点 —— 它既能当指数、也能当 E 列第 2 行的引用：
    ///
    /// - `=1E2` → `100`：形状满足，`E2` 被吞进指数。**贪婪**，不回头考虑
    ///   「它当引用是不是更讲得通」—— Excel 与 TS 参考实现都是这么切的，
    ///   所以 `=1E2E2` 是「`100` 后面跟着 `E2`」而非「`1` 乘不上的两个引用」。
    /// - `=1+E2` → 隔着运算符，指数扫描根本轮不到 `E2`，它还是引用。
    /// - `=1E` / `=1E+` → 零位指数数字，整段退回，`E` 落回标识符。
    /// - `=1E$2` → `$` 不是指数符号，退回，`E$2` 是行绝对引用。
    ///
    /// 只认十进制：Excel 公式里没有 `0x` / `0b` 这类前缀字面量。
    fn consume_exponent_suffix(&mut self) {
        let save = self.pos;
        match self.peek() {
            Some('e') | Some('E') => {
                self.advance();
            }
            _ => return,
        }
        if matches!(self.peek(), Some('+') | Some('-')) {
            self.advance();
        }
        let digits_start = self.pos;
        while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
            self.advance();
        }
        if self.pos == digits_start {
            self.pos = save;
        }
    }

    pub(super) fn parse_string(&mut self) -> Option<Expr> {
        self.advance(); // skip opening "
        let start = self.pos;
        while let Some(c) = self.peek() {
            if c == '"' {
                let s: String = self.chars[start..self.pos].iter().collect();
                self.advance(); // skip closing "
                return Some(Expr::Text(s));
            }
            self.advance();
        }
        None // unterminated string
    }
}

#[cfg(test)]
#[path = "lexer_tests.rs"]
mod tests;
