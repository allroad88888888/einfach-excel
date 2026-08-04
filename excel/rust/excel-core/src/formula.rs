//! 公式解析：`=` 开头的公式文本进，[`Expr`] 语法树出。
//!
//! 手写的递归下降解析器，按职责切成几片（本文件只做装配，实现全在
//! `formula/` 下）：
//!
//! | 子模块 | 负责 |
//! |---|---|
//! | `ast` | 语法树的数据定义 |
//! | `lexer` | 字符游标上的记号扫描 |
//! | `operators` | 运算符优先级阶梯 |
//! | `primary` | 基本表达式按首字符分流 |
//! | `refs` | A1 风格引用的区间形态 |
//! | `identifier` | 标识符记号之后的分流 |
//! | `array_lit` | 常量数组字面量 |
//! | `table_ref` | 结构化表引用 |
//! | `quoted_name` | 带引号表名的引号规则（读与写） |
//!
//! 子模块一律私有，公开面由本文件逐项 `pub use` 出去 —— `crate::formula::X`
//! 的路径与拆分前逐字相同，调用点不需要跟着改。

mod array_lit;
mod ast;
mod identifier;
mod lexer;
mod operators;
mod primary;
mod quoted_name;
mod refs;
mod table_ref;

pub use ast::{BinOperator, Expr, RangeAbs, RangeBounds, RefAbs, TableArea};
pub(crate) use quoted_name::push_sheet_name;

use lexer::Parser;

/// Parse a formula string. Must start with '='.
/// Returns None if parsing fails.
pub fn parse_formula(input: &str) -> Option<Expr> {
    let input = input.trim();
    if !input.starts_with('=') {
        return None;
    }
    let mut parser = Parser::new(&input[1..]);
    let expr = parser.parse_expr()?;
    if parser.pos < parser.chars.len() {
        return None; // leftover input
    }
    Some(expr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_no_equals_returns_none() {
        assert!(parse_formula("A1+B1").is_none());
    }

    #[test]
    fn parse_empty_returns_none() {
        assert!(parse_formula("=").is_none());
    }
}
