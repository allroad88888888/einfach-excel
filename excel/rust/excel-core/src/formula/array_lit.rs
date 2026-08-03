//! 常量数组字面量 `={1,2;3,4}` 的语法。

use super::ast::Expr;
use super::lexer::Parser;

/// Cell-expression check for `Expr::ArrayLit` elements. Excel restricts
/// constant-array entries to literal values; we accept exactly the four
/// shapes that can appear in the parsed source for such a literal:
///
/// - `Expr::Number(_)` — `1`, `3.14`, etc.
/// - `Expr::Text(_)` — `"foo"`.
/// - `Expr::Bool(_)` — `TRUE` / `FALSE`.
/// - `Expr::Error(_)` — `#N/A`, `#VALUE!`, etc.
/// - `Expr::Negate(inner)` where `inner` is a `Number`.
///
/// Cell refs, function calls, ranges, names, and binops are rejected.
fn is_valid_array_lit_element(expr: &Expr) -> bool {
    match expr {
        Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) => true,
        Expr::Negate(inner) => matches!(inner.as_ref(), Expr::Number(_)),
        _ => false,
    }
}

impl Parser {
    /// Excel constant-array literal: `{a,b;c,d}`. `,` separates columns
    /// within a row, `;` separates rows. We've already peeked the opening
    /// `{`; this consumes the brace, the body, and the closing `}`.
    ///
    /// Cell expressions inside the literal are parsed via `parse_expr`
    /// (so unary minus on a number works: `={-1, 2}`) and then validated
    /// against the constant-array contract: only `Number`, `Text`,
    /// `Bool`, `Error`, and `Negate(Number)` are accepted. Anything else (cell
    /// refs, function calls, ranges, nested literals, binops other than
    /// the single Negate-of-Number form) is rejected by returning
    /// `None`, which surfaces as a parse error at the top level. This
    /// matches Excel's restriction that constant-array elements be
    /// literals — formulas inside `{...}` would otherwise blur the
    /// boundary between the parsed literal and a CSE-array context the
    /// engine doesn't otherwise support.
    ///
    /// Rows MUST be rectangular: every row has the same column count as
    /// the first. A ragged literal (`={1,2;3}`) is a parse error.
    pub(super) fn parse_array_literal(&mut self) -> Option<Expr> {
        self.advance(); // consume '{'
        self.skip_whitespace();
        let mut rows_data: Vec<Vec<Expr>> = Vec::new();
        // Parse at least one cell — empty `{}` is not a valid Excel
        // constant array and parsing nothing here would yield a 0x0
        // array that the spill machinery can't anchor anywhere useful.
        loop {
            let mut row: Vec<Expr> = Vec::new();
            // Parse cells separated by `,` within this row.
            loop {
                self.skip_whitespace();
                let cell = self.parse_expr()?;
                if !is_valid_array_lit_element(&cell) {
                    return None;
                }
                row.push(cell);
                self.skip_whitespace();
                if self.peek() == Some(',') {
                    self.advance();
                    continue;
                }
                break;
            }
            rows_data.push(row);
            self.skip_whitespace();
            if self.peek() == Some(';') {
                self.advance();
                continue;
            }
            break;
        }
        self.skip_whitespace();
        if self.peek() != Some('}') {
            return None;
        }
        self.advance(); // consume '}'

        if rows_data.is_empty() {
            return None;
        }
        let cols = rows_data[0].len();
        if cols == 0 {
            return None;
        }
        // Rectangular check — every row must share the column count.
        for r in &rows_data {
            if r.len() != cols {
                return None;
            }
        }
        let rows = rows_data.len();
        let mut data: Vec<Expr> = Vec::with_capacity(rows * cols);
        for r in rows_data {
            for cell in r {
                data.push(cell);
            }
        }
        // u32 conversion: practical literals fit easily; if a literal
        // somehow overflowed (millions of cells in source) we'd rather
        // fail parse than silently truncate.
        let rows_u32 = u32::try_from(rows).ok()?;
        let cols_u32 = u32::try_from(cols).ok()?;
        Some(Expr::ArrayLit {
            rows: rows_u32,
            cols: cols_u32,
            data,
        })
    }
}

#[cfg(test)]
#[path = "array_lit_tests.rs"]
mod tests;
