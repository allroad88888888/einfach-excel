//! 结构化表引用 `Table1[Col]` 这一族语法（设计文档 #32 §5.1/§5.2）。

use super::ast::{Expr, TableArea};
use super::lexer::Parser;

impl Parser {
    /// Parse a structured-reference body starting at the outer `[`
    /// (design doc §5.1 `inner`). `table` carries the already-read table
    /// name (`Some`) for `Table1[...]`, or `None` for a table-less
    /// `[...]`. Area qualifiers and column segments share the same AST.
    /// `'`-escapes and empty `[]` remain outside this grammar:
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
                    let columns = if self.peek() == Some('[') {
                        self.parse_table_column_segment()?
                    } else {
                        let col = self.parse_bare_colref()?;
                        (col.clone(), col)
                    };
                    (TableArea::ThisRow, Some(columns))
                }
            }
            '[' => {
                // [[#Headers],[Col]] 与 [[Col1]:[Col2]] 共用列段扫描。
                let start = self.pos;
                self.advance();
                self.skip_whitespace();
                let area = if self.peek() == Some('#') {
                    let area = self.parse_table_special()?;
                    self.skip_whitespace();
                    self.expect(']')?;
                    self.skip_whitespace();
                    self.expect(',')?;
                    self.skip_whitespace();
                    area
                } else {
                    self.pos = start;
                    TableArea::Data
                };
                (area, Some(self.parse_table_column_segment()?))
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

    /// 单列与连续列段；由数据区、限定区及 ThisRow 三种写法共用。
    fn parse_table_column_segment(&mut self) -> Option<(String, String)> {
        let first = self.parse_bracketed_colref()?;
        self.skip_whitespace();
        if self.peek() == Some(':') {
            self.advance();
            self.skip_whitespace();
            Some((first, self.parse_bracketed_colref()?))
        } else {
            Some((first.clone(), first))
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
