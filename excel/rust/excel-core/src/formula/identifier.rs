//! 决定一个标识符记号究竟构成哪种表达式。
//!
//! `TRUE`/`FALSE` 字面量、`(` 函数调用、`[` 表引用、`!` 跨表引用、
//! 单元格或整列引用、兜底的 `Expr::Name` —— 分流次序本身是语义的一
//! 部分，函数内注释逐条写明了为什么是这个次序。

use super::ast::Expr;
use super::lexer::Parser;

impl Parser {
    /// Identifier: could be a function name (followed by '(') or a cell reference.
    ///
    /// We allow `.` between identifier chars so Excel 2010+ dotted function
    /// names like `RANK.EQ` / `STDEV.P` / `PERCENTILE.INC` parse as a single
    /// name. The rule: after the first alpha char, accept
    /// `[A-Za-z0-9_]`. A `.` is only consumed when the very next char is
    /// itself a valid identifier char (alpha / digit / underscore) — this
    /// keeps a trailing `RANK.` from being absorbed (the `.` is left for
    /// the caller, which will then fail to parse the formula), and
    /// `RANK..EQ` won't be eaten as one identifier either. Numbers like
    /// `1.5` route through `parse_number` instead, because identifiers
    /// must start with an alpha char — so the decimal-separator role of
    /// `.` is unaffected.
    pub(super) fn parse_identifier(&mut self) -> Option<Expr> {
        let start = self.pos;
        // Read alphanumerics + underscore. Allow '.' only when followed by
        // another identifier char (see doc above).
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == '_' {
                self.advance();
            } else if c == '.' {
                match self.peek_at(1) {
                    Some(next) if next.is_ascii_alphanumeric() || next == '_' => {
                        self.advance();
                    }
                    _ => break,
                }
            } else {
                break;
            }
        }
        let ident: String = self.chars[start..self.pos].iter().collect();

        self.skip_whitespace();

        // Check for TRUE / FALSE literals (case-insensitive). Excel treats
        // these as bare identifiers (no parens needed) — they shouldn't be
        // tried as cell addresses. BUT `=TRUE()` / `=FALSE()` are also legal
        // (Excel exposes them as zero-arg functions), so a trailing `(` must
        // route through the function-call branch first, where the dispatcher
        // returns the same boolean. Bare `TRUE` / `FALSE` (no parens) stays
        // an `Expr::Bool` literal.
        let upper = ident.to_ascii_uppercase();
        if (upper == "TRUE" || upper == "FALSE") && self.peek() != Some('(') {
            return Some(Expr::Bool(upper == "TRUE"));
        }

        // Check if it's a function call
        if self.peek() == Some('(') {
            self.advance(); // skip '('
            let args = self.parse_func_args()?;
            self.expect(')')?;
            return Some(Expr::FuncCall {
                name: ident.to_ascii_uppercase(),
                args,
            });
        }

        // Structured (Table) reference: `Table1[...]`. `[` has no other
        // lexical role, so `IDENT[` is unambiguously a structured reference.
        // This MUST precede the cell-ref / whole-column attempts below,
        // because a table name such as `Table1` also parses as a bare cell
        // address (column "TABLE", row 1) — the trailing `[` is the sole
        // disambiguator (design doc §5.2 attach point / §4.2 guard note).
        if self.peek() == Some('[') {
            return self.parse_table_ref_body(Some(ident));
        }

        // Check for cross-sheet reference: `Name!A1` / `Name!A1:B3` /
        // `Name!A:C` / `Name!1:3` (Excel syntax).
        // The bang `!` unambiguously marks the preceding identifier as a
        // sheet name — it's not a token in any other formula context. The
        // identifier ALWAYS becomes a sheet name when '!' follows, even if
        // the same chars would also parse as a cell address.
        //
        // `!` 之后的尾巴与同表引用是**同一族语法**（单格 / 有界区间 / 整列 /
        // 整行），所以交给 `refs` 里的 `finish_sheet_qualified_ref` —— 它复用
        // 同表那三个扫描器，不在这里另写一份只认 `A1` 的窄版本。
        if self.peek() == Some('!') {
            self.advance(); // skip '!'
            return self.finish_sheet_qualified_ref(ident);
        }

        // Same-sheet reference (cell ref, bounded / dynamic range, or
        // whole-column range), `$`-aware. Rewind to the identifier start:
        // the identifier read above only served to rule out the function-
        // call / sheet-ref / table-ref / TRUE-FALSE forms (none matched), so
        // re-scanning the raw source as a reference here is unambiguous. A
        // successful `scan_abs_cell_addr` on the whole leading token is
        // exactly equivalent to the old `CellAddress::parse(&ident)` test for
        // the relative case, plus it now understands `A$1`.
        let name_fallback_pos = self.pos;
        self.pos = start;
        if let Some((addr, abs)) = self.scan_abs_cell_addr() {
            return self.finish_same_sheet_ref(addr, abs);
        }
        if let Some(expr) = self.try_scan_whole_col_range() {
            return Some(expr);
        }

        // A bare identifier that didn't match anything above (function
        // call, TRUE/FALSE, cross-sheet ref, cell ref, or whole-column
        // range) is a `Name`. The evaluator resolves it against the LET
        // scope at eval time, or yields `#NAME?` if unbound. Numbers
        // never reach here because they route through `parse_number`.
        // Restore the post-identifier position first (the reference scanners
        // above rewound to the identifier start).
        self.pos = name_fallback_pos;
        Some(Expr::Name(ident))
    }
}

#[cfg(test)]
#[path = "identifier_tests.rs"]
mod tests;
