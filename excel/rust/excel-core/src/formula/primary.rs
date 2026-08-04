//! 基本表达式：按首字符分流到对应的语法分支。
//!
//! `(` 这一支的两种形态（分组表达式 / 多区域引用）就地判定，其余首
//! 字符一律转交给拥有那族语法的模块。

use super::ast::Expr;
use super::lexer::Parser;

/// Does `expr` denote a reference (the only thing allowed inside a
/// multi-area `(A1:B2, D5:E6)` reference)? Accepts same-sheet and
/// cross-sheet cell refs and ranges. Everything else — literals,
/// binops, function calls, nested multi-area — is rejected.
fn is_ref_expr(expr: &Expr) -> bool {
    matches!(
        expr,
        Expr::CellRef(..)
            | Expr::Range { .. }
            | Expr::SheetRef { .. }
            | Expr::SheetRange { .. }
            | Expr::SpillRef(_)
            | Expr::DynamicRange { .. }
    )
}

impl Parser {
    /// primary = number | string | error | func_call | cell_ref_or_range | '(' expr ')' | '{' array_lit '}'
    pub(super) fn parse_primary(&mut self) -> Option<Expr> {
        self.skip_whitespace();

        match self.peek()? {
            '(' => {
                // Two surface forms share the `(` opener:
                //   1. Grouped expression: `(A1+B1)`, `(1+2)`, `(A1:B2)`.
                //   2. Multi-area reference: `(A1:B2, D5:E6, F1)` — Excel's
                //      union/list-of-areas syntax, consumed by AREAS (and
                //      some criteria-style aggregates in advanced Excel).
                //
                // Speculative parse: consume `(`, parse one inner expr,
                // then peek for `,`. If we see a comma AND the inner expr
                // is a reference (CellRef / Range / SheetRef / SheetRange),
                // commit to multi-area parsing — every remaining element
                // must also be a reference. Otherwise the inner expr is
                // just the body of a grouped expression and `)` follows.
                //
                // A `(A1, 1+2)` shape (ref then non-ref) is a parse error
                // — it can't be a grouped expression (no operator between
                // refs) and can't be a multi-area reference (non-ref
                // element). Returning `None` here surfaces as a top-level
                // parse failure.
                self.advance();
                let first = self.parse_expr()?;
                self.skip_whitespace();
                if self.peek() == Some(',') {
                    // Multi-area path: first element MUST be a ref.
                    if !is_ref_expr(&first) {
                        return None;
                    }
                    let mut parts: Vec<Expr> = vec![first];
                    while self.peek() == Some(',') {
                        self.advance();
                        self.skip_whitespace();
                        let next = self.parse_expr()?;
                        if !is_ref_expr(&next) {
                            return None;
                        }
                        parts.push(next);
                        self.skip_whitespace();
                    }
                    self.expect(')')?;
                    Some(Expr::MultiArea(parts))
                } else {
                    // Grouped expression — strip the parens.
                    self.expect(')')?;
                    Some(first)
                }
            }
            '{' => self.parse_array_literal(),
            '"' => self.parse_string(),
            // 带引号表名：`'My Sheet'!A1`。`'` 在公式里没有第二个词法角色
            // （字符串字面量用的是 `"`），所以基本位置上的 `'` 无歧义地开启
            // 一个带引号名字 —— 引号规则与写回都在 `quoted_name` 那一片。
            '\'' => self.parse_quoted_primary(),
            '#' => self.parse_error_literal(),
            // Table-less structured reference: `[Col]` / `[@Col]` written
            // inside a Table's own cells. `[` has no other lexical role, so
            // a leading `[` at primary position is unambiguously a
            // structured reference whose table is resolved from the current
            // cell at eval time (design doc §5.1 `tableref` alt).
            '[' => self.parse_table_ref_body(None),
            c if c.is_ascii_digit() || c == '.' => {
                // Disambiguate `<digits>:<digits>` (whole-row range) from a
                // plain number. We scan a digit run; if the next non-digit
                // char is ':' followed by another digit run, treat as a
                // whole-row range. Otherwise fall back to parse_number,
                // which handles the fractional and scientific forms.
                if c.is_ascii_digit() {
                    if let Some(range) = self.try_parse_whole_row_range() {
                        return Some(range);
                    }
                }
                self.parse_number()
            }
            c if c.is_ascii_alphabetic() => self.parse_identifier(),
            // A leading `$` unambiguously introduces a reference — no other
            // formula token starts with `$` (sheet names, function names, and
            // bare Names never carry one). Cover column-absolute cell refs
            // (`$A$1`, `$A1`), absolute whole-column ranges (`$A:$C`), and
            // absolute whole-row ranges (`$1:$3`).
            '$' => self.parse_dollar_primary(),
            _ => None,
        }
    }
}

#[cfg(test)]
#[path = "primary_tests.rs"]
mod tests;
