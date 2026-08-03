//! `lexer.rs` 的单元测试：记号扫描（数字、字符串、错误字面量）。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::formula::*;
use einfach_core::ValueError;

#[test]
fn parse_simple_number() {
    assert_eq!(parse_formula("=42"), Some(Expr::Number(42.0)));
}

#[test]
fn parse_decimal() {
    assert_eq!(parse_formula("=3.14"), Some(Expr::Number(3.14)));
}

#[test]
fn parse_string_literal() {
    assert_eq!(
        parse_formula("=\"hello\""),
        Some(Expr::Text("hello".into()))
    );
}

#[test]
fn parse_error_literals() {
    assert_eq!(
        parse_formula("=#CALC!"),
        Some(Expr::Error(ValueError::Calc))
    );
    assert_eq!(
        parse_formula("=#N/A"),
        Some(Expr::Error(ValueError::NotAvailable))
    );
    assert_eq!(
        parse_formula("=#DIV/0!"),
        Some(Expr::Error(ValueError::DivisionByZero))
    );
    assert_eq!(
        parse_formula("=#value!"),
        Some(Expr::Error(ValueError::InvalidValue))
    );
    assert_eq!(
        parse_formula("=#BUSY!"),
        Some(Expr::Error(ValueError::Busy))
    );
}
