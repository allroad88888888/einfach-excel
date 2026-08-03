//! A1 风格引用的区间形态：`A1:B2`、`A:C`、`1:3` 及其 `$` 变体。
//!
//! 起点记号由 `lexer` 扫出，这里把它收成最终的引用节点 —— 有没有
//! `:` 尾巴、尾巴是静态角还是算出来的引用、整列还是整行。

use crate::cell::CellAddress;

use super::ast::{Expr, RangeAbs, RangeBounds, RefAbs};
use super::lexer::Parser;

impl Parser {
    /// A leading `$` always introduces a reference. Distinguish the three
    /// shapes by what follows: `$A...` is a column-absolute cell ref or an
    /// absolute whole-column range; `$1:...` is an absolute whole-row range.
    pub(super) fn parse_dollar_primary(&mut self) -> Option<Expr> {
        if let Some((addr, abs)) = self.scan_abs_cell_addr() {
            return self.finish_same_sheet_ref(addr, abs);
        }
        if let Some(expr) = self.try_scan_whole_col_range() {
            return Some(expr);
        }
        self.try_parse_whole_row_range()
    }

    /// Given an already-parsed start corner, consume an optional `:` range
    /// tail. Yields a bounded `Range` (both corners are addresses), a
    /// `DynamicRange` (the end is a computed reference such as
    /// `A1:INDEX(...)`), or a bare `CellRef` when no `:` follows.
    pub(super) fn finish_same_sheet_ref(
        &mut self,
        start: CellAddress,
        start_abs: RefAbs,
    ) -> Option<Expr> {
        self.skip_whitespace();
        if self.peek() == Some(':') {
            self.advance();
            self.skip_whitespace();
            let after_colon = self.pos;
            if let Some((end, end_abs)) = self.scan_abs_cell_addr() {
                return Some(Expr::Range {
                    start,
                    end,
                    unbounded: RangeBounds::None,
                    abs: RangeAbs::new(start_abs, end_abs),
                });
            }
            self.pos = after_colon;
            let end = self.parse_unary()?;
            return Some(Expr::DynamicRange {
                start: Box::new(Expr::CellRef(start, start_abs)),
                end: Box::new(end),
            });
        }
        Some(Expr::CellRef(start, start_abs))
    }

    /// Whole-column range `[$]A:[$]C`. Both corners are column letters with
    /// an optional `$`; the range spans every row. Returns `None` (restoring
    /// position) when the shape is not a whole-column range — in particular
    /// when the end column is immediately followed by a digit (that is the
    /// `A1:B2` bounded-range family, handled elsewhere).
    pub(super) fn try_scan_whole_col_range(&mut self) -> Option<Expr> {
        let save = self.pos;
        let Some((start_col, start_col_abs)) = self.scan_abs_col() else {
            self.pos = save;
            return None;
        };
        self.skip_whitespace();
        if self.peek() != Some(':') {
            self.pos = save;
            return None;
        }
        self.advance(); // ':'
        self.skip_whitespace();
        let Some((end_col, end_col_abs)) = self.scan_abs_col() else {
            self.pos = save;
            return None;
        };
        // `A:B3` — a trailing digit means the right corner was a cell
        // address, so this is not a whole-column range.
        if self.peek().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            self.pos = save;
            return None;
        }
        Some(Expr::Range {
            start: CellAddress::new(0, start_col),
            end: CellAddress::new(u32::MAX, end_col),
            unbounded: RangeBounds::Rows,
            abs: RangeAbs::new(
                RefAbs::new(start_col_abs, false),
                RefAbs::new(end_col_abs, false),
            ),
        })
    }

    /// Speculative parse for `[$]<digits>:[$]<digits>` whole-row syntax
    /// (`1:1`, `1:3`, and the absolute forms `$1:$3`, `1:$3`, ...). On
    /// success consumes both corners and returns the range. On failure rolls
    /// back to the original position so `parse_number` (relative entry) or
    /// the caller (`$` entry) can take over.
    pub(super) fn try_parse_whole_row_range(&mut self) -> Option<Expr> {
        let save = self.pos;
        // Optional `$` then first digit run.
        let start_row_abs = self.consume_dollar();
        let s1 = self.pos;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                self.advance();
            } else {
                break;
            }
        }
        if self.pos == s1 {
            self.pos = save;
            return None;
        }
        let first: String = self.chars[s1..self.pos].iter().collect();
        // Must see ':' immediately (no whitespace — `1 :1` is intentionally
        // not the Excel whole-row syntax; this keeps decimals like
        // `1.5` from accidentally matching when a future change moves
        // the dispatch).
        if self.peek() != Some(':') {
            self.pos = save;
            return None;
        }
        self.advance();
        // Optional `$` then second digit run.
        let end_row_abs = self.consume_dollar();
        let s2 = self.pos;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                self.advance();
            } else {
                break;
            }
        }
        if self.pos == s2 {
            // Not `digit:digit` — could be `1:A1` or similar nonsense.
            // Roll back. Note: the parser doesn't currently accept
            // anything else starting with `<digits>:`, so this is a
            // simple failure mode (returns None and parse fails).
            self.pos = save;
            return None;
        }
        let second: String = self.chars[s2..self.pos].iter().collect();
        // After the second digit run we must NOT be followed by letters
        // — that would mean the user wrote `1:A1`, which isn't a valid
        // construct in either bounded or unbounded range syntax.
        if self
            .peek()
            .map(|c| c.is_ascii_alphabetic())
            .unwrap_or(false)
        {
            self.pos = save;
            return None;
        }

        let start_row: u32 = first.parse().ok()?;
        let end_row: u32 = second.parse().ok()?;
        if start_row == 0 || end_row == 0 {
            // Excel rows are 1-based; reject `0:0`.
            self.pos = save;
            return None;
        }
        Some(Expr::Range {
            start: CellAddress::new(start_row - 1, 0),
            end: CellAddress::new(end_row - 1, u32::MAX),
            unbounded: RangeBounds::Cols,
            abs: RangeAbs::new(
                RefAbs::new(false, start_row_abs),
                RefAbs::new(false, end_row_abs),
            ),
        })
    }
}

#[cfg(test)]
#[path = "refs_tests.rs"]
mod tests;
