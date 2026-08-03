//! 按 Excel 的运算符优先级把子表达式串成表达式树。
//!
//! 由低到高一级一个函数（比较 → `&` → `+ -` → `* /` → `^` → `%` →
//! 一元负号 → 后缀 `(args)` / `#`），每级只认自己那几个运算符，剩下
//! 的往下一级递。阶梯的底是 `primary`。

use super::ast::{BinOperator, Expr};
use super::lexer::Parser;

impl Parser {
    /// Top-level: comparisons (=, <>, <, <=, >, >=) — lowest precedence.
    pub(super) fn parse_expr(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        let mut left = self.parse_concat()?;

        loop {
            self.skip_whitespace();
            let op = match (self.peek(), self.peek_at(1)) {
                (Some('<'), Some('>')) => {
                    self.advance();
                    self.advance();
                    BinOperator::NotEq
                }
                (Some('<'), Some('=')) => {
                    self.advance();
                    self.advance();
                    BinOperator::LtEq
                }
                (Some('>'), Some('=')) => {
                    self.advance();
                    self.advance();
                    BinOperator::GtEq
                }
                (Some('<'), _) => {
                    self.advance();
                    BinOperator::Lt
                }
                (Some('>'), _) => {
                    self.advance();
                    BinOperator::Gt
                }
                (Some('='), _) => {
                    self.advance();
                    BinOperator::Eq
                }
                _ => break,
            };
            let right = self.parse_concat()?;
            left = Expr::BinOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Some(left)
    }

    /// concat = add_sub ('&' add_sub)* — left-assoc, between comparison and add/sub.
    fn parse_concat(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        let mut left = self.parse_add_sub()?;

        loop {
            self.skip_whitespace();
            if self.peek() == Some('&') {
                self.advance();
                let right = self.parse_add_sub()?;
                left = Expr::BinOp {
                    op: BinOperator::Concat,
                    left: Box::new(left),
                    right: Box::new(right),
                };
            } else {
                break;
            }
        }
        Some(left)
    }

    /// add_sub = mul_div (('+' | '-') mul_div)*
    fn parse_add_sub(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        let mut left = self.parse_mul_div()?;

        loop {
            self.skip_whitespace();
            match self.peek() {
                Some('+') => {
                    self.advance();
                    let right = self.parse_mul_div()?;
                    left = Expr::BinOp {
                        op: BinOperator::Add,
                        left: Box::new(left),
                        right: Box::new(right),
                    };
                }
                Some('-') => {
                    self.advance();
                    let right = self.parse_mul_div()?;
                    left = Expr::BinOp {
                        op: BinOperator::Sub,
                        left: Box::new(left),
                        right: Box::new(right),
                    };
                }
                _ => break,
            }
        }
        Some(left)
    }

    /// mul_div = pow (('*' | '/') pow)*
    fn parse_mul_div(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        let mut left = self.parse_pow()?;

        loop {
            self.skip_whitespace();
            match self.peek() {
                Some('*') => {
                    self.advance();
                    let right = self.parse_pow()?;
                    left = Expr::BinOp {
                        op: BinOperator::Mul,
                        left: Box::new(left),
                        right: Box::new(right),
                    };
                }
                Some('/') => {
                    self.advance();
                    let right = self.parse_pow()?;
                    left = Expr::BinOp {
                        op: BinOperator::Div,
                        left: Box::new(left),
                        right: Box::new(right),
                    };
                }
                _ => break,
            }
        }
        Some(left)
    }

    /// pow = percent ('^' pow)? — right-associative
    fn parse_pow(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        let left = self.parse_percent()?;
        self.skip_whitespace();
        if self.peek() == Some('^') {
            self.advance();
            let right = self.parse_pow()?;
            Some(Expr::BinOp {
                op: BinOperator::Pow,
                left: Box::new(left),
                right: Box::new(right),
            })
        } else {
            Some(left)
        }
    }

    /// percent = unary '%'* — 后缀，可叠加。
    ///
    /// 位置依据是 Excel 文档的运算符优先级表（由高到低）：引用运算符
    /// (`:` `,` 空格) > 一元负号 > `%` > `^` > `*` `/` > `+` `-` > `&` >
    /// 比较。所以 `%` 恰好夹在 `parse_pow` 与 `parse_unary` 之间：
    ///
    /// * `=50%` → `Percent(50)` = 0.5
    /// * `=-50%` → `Percent(Negate(50))` = -0.5（负号在里层，因为它优先级
    ///   更高；这里两种结合方式数值相同，取 Excel 文档的那一种）
    /// * `=2^2%` → `Pow(2, Percent(2))` = 2^0.02，**不是** `(2^2)%`
    /// * `=50%%` → `Percent(Percent(50))` = 0.005（Excel 允许叠加）
    /// * `=1+2%` → `Add(1, Percent(2))` = 1.02
    fn parse_percent(&mut self) -> Option<Expr> {
        let mut expr = self.parse_unary()?;
        loop {
            self.skip_whitespace();
            if self.peek() != Some('%') {
                return Some(expr);
            }
            self.advance();
            expr = Expr::Percent(Box::new(expr));
        }
    }

    /// unary = '-' unary | primary call_suffix
    ///
    /// `call_suffix` chains trailing `(args)` onto the primary so
    /// `=LAMBDA(x, x*x)(5)` parses as `Call(FuncCall("LAMBDA", ...), [5])`
    /// — immediate-application of an inline lambda. Multiple chained
    /// applications (`=f()()()`) iterate the loop; if no `(` follows,
    /// the primary is returned untouched.
    pub(super) fn parse_unary(&mut self) -> Option<Expr> {
        self.skip_whitespace();
        if self.peek() == Some('-') {
            self.advance();
            let expr = self.parse_unary()?;
            Some(Expr::Negate(Box::new(expr)))
        } else {
            let primary = self.parse_primary()?;
            let called = self.parse_call_suffix(primary)?;
            self.parse_spill_suffix(called)
        }
    }

    fn parse_spill_suffix(&mut self, mut expr: Expr) -> Option<Expr> {
        loop {
            self.skip_whitespace();
            if self.peek() != Some('#') {
                return Some(expr);
            }
            if !matches!(expr, Expr::CellRef(..) | Expr::SheetRef { .. }) {
                return None;
            }
            self.advance();
            expr = Expr::SpillRef(Box::new(expr));
        }
    }

    /// After parsing a primary, consume any trailing `(args)` chain and
    /// wrap the callee in `Expr::Call`. A trailing `(` is only treated
    /// as a call if the parsed callee CAN produce a callable value —
    /// we lean conservative and accept it on any `FuncCall` / `Name` /
    /// `Call` callee (the cases that can resolve to a lambda). This
    /// avoids `=A1(5)` (where A1 is a cell ref) being mis-parsed as a
    /// call when the user meant `A1 *... *(5)` etc.; the parser already
    /// requires `*` for that case so the ambiguity is moot, but the
    /// guard keeps the surface tight in case future primaries appear.
    fn parse_call_suffix(&mut self, mut callee: Expr) -> Option<Expr> {
        loop {
            self.skip_whitespace();
            if self.peek() != Some('(') {
                return Some(callee);
            }
            // Only callees that could plausibly be a lambda value get the
            // trailing-call treatment. Cell refs / literals / ranges
            // can't, and accepting them would shadow legitimate parse
            // failures with confusing "Call(CellRef(A1), …)" nodes.
            if !matches!(
                callee,
                Expr::FuncCall { .. } | Expr::Name(_) | Expr::Call(_, _)
            ) {
                return Some(callee);
            }
            self.advance(); // consume '('
            let args = self.parse_func_args()?;
            self.expect(')')?;
            callee = Expr::Call(Box::new(callee), args);
        }
    }

    pub(super) fn parse_func_args(&mut self) -> Option<Vec<Expr>> {
        let mut args = Vec::new();
        self.skip_whitespace();

        if self.peek() == Some(')') {
            return Some(args); // no args
        }

        // First try to parse range-aware args
        args.push(self.parse_func_arg()?);

        loop {
            self.skip_whitespace();
            if self.peek() == Some(',') {
                self.advance();
                args.push(self.parse_func_arg()?);
            } else {
                break;
            }
        }
        Some(args)
    }

    fn parse_func_arg(&mut self) -> Option<Expr> {
        // Function args can be regular expressions (which include ranges in identifiers)
        self.parse_expr()
    }
}

#[cfg(test)]
#[path = "operators_tests.rs"]
mod tests;
