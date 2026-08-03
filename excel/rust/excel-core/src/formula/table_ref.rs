//! 结构化表引用 `Table1[Col]` 这一族语法（设计文档 #32 §5.1/§5.2）。

use super::ast::{Expr, TableArea};
use super::lexer::Parser;

impl Parser {
    /// Parse a structured-reference body starting at the outer `[`
    /// (design doc §5.1 `inner`). `table` carries the already-read table
    /// name (`Some`) for `Table1[...]`, or `None` for a table-less
    /// `[...]`. The MVP grammar (§3.2 defers combined qualifiers /
    /// `'`-escapes / empty `[]`):
    ///
    /// ```text
    /// inner := '@' colspec | special | '[' colref ']' (':' '[' colref ']')? | colref
    /// ```
    pub(super) fn parse_table_ref_body(&mut self, table: Option<String>) -> Option<Expr> {
        self.expect('[')?; // consume the outer '['
        self.skip_whitespace();
        let (area, columns) = match self.peek()? {
            '#' => (self.parse_table_special()?, None),
            '@' => {
                self.advance(); // consume '@'
                self.skip_whitespace();
                if self.peek() == Some(']') {
                    // Bare `[@]` — the whole current row across every column.
                    (TableArea::ThisRow, None)
                } else {
                    let col = self.parse_table_colspec()?;
                    (TableArea::ThisRow, Some((col.clone(), col)))
                }
            }
            '[' => {
                // `[colref]` possibly followed by `:` `[colref]` (a
                // multi-column segment). Bracketed column names carry the
                // display spelling verbatim.
                let first = self.parse_bracketed_colref()?;
                self.skip_whitespace();
                if self.peek() == Some(':') {
                    self.advance();
                    self.skip_whitespace();
                    if self.peek() != Some('[') {
                        return None;
                    }
                    let second = self.parse_bracketed_colref()?;
                    (TableArea::Data, Some((first, second)))
                } else {
                    (TableArea::Data, Some((first.clone(), first)))
                }
            }
            _ => {
                let col = self.parse_bare_colref()?;
                (TableArea::Data, Some((col.clone(), col)))
            }
        };
        self.skip_whitespace();
        self.expect(']')?; // consume the outer ']'
        Some(Expr::TableRef {
            table,
            area,
            columns,
        })
    }

    /// Parse a `#special` area keyword (case-insensitive). No keyword is a
    /// prefix of another, so match order is irrelevant.
    fn parse_table_special(&mut self) -> Option<TableArea> {
        let specials = [
            ("#Headers", TableArea::Headers),
            ("#Totals", TableArea::Totals),
            ("#Data", TableArea::Data),
            ("#This Row", TableArea::ThisRow),
            ("#All", TableArea::All),
        ];
        for (token, area) in specials {
            if self.matches_literal(token) {
                self.pos += token.chars().count();
                return Some(area);
            }
        }
        None
    }

    /// A `colspec` after `@`: either a bracketed `[colref]` (for names with
    /// special characters) or a bare `colref`.
    fn parse_table_colspec(&mut self) -> Option<String> {
        self.skip_whitespace();
        if self.peek() == Some('[') {
            self.parse_bracketed_colref()
        } else {
            self.parse_bare_colref()
        }
    }

    /// Parse `[colref]` — consumes the inner `[`, the column name up to the
    /// inner `]`, and the closing `]`. The name is trimmed but internal
    /// spaces are preserved; an empty name is a parse error.
    fn parse_bracketed_colref(&mut self) -> Option<String> {
        self.expect('[')?; // consume inner '['
        let start = self.pos;
        while let Some(c) = self.peek() {
            if c == ']' || c == '[' || c == '#' || c == '@' {
                break;
            }
            self.advance();
        }
        let raw: String = self.chars[start..self.pos].iter().collect();
        let name = raw.trim().to_string();
        if name.is_empty() {
            return None;
        }
        self.expect(']')?; // consume inner ']'
        Some(name)
    }

    /// Parse a bare `colref`: any run of characters except `[ ] # @`,
    /// trimmed (internal spaces kept). Empty is a parse error.
    fn parse_bare_colref(&mut self) -> Option<String> {
        let start = self.pos;
        while let Some(c) = self.peek() {
            if c == '[' || c == ']' || c == '#' || c == '@' {
                break;
            }
            self.advance();
        }
        let raw: String = self.chars[start..self.pos].iter().collect();
        let name = raw.trim().to_string();
        if name.is_empty() {
            return None;
        }
        Some(name)
    }
}
