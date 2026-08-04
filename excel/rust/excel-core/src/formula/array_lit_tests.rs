//! `array_lit.rs` 的单元测试：常量数组字面量。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::formula::*;
use einfach_core::ValueError;

// === Excel constant-array literal: `={a,b;c,d}` ===

#[test]
fn parse_array_lit_single_row() {
    // `={1,2,3}` — 1 row × 3 cols, row-major data.
    let result = parse_formula("={1,2,3}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 1,
            cols: 3,
            data: vec![Expr::Number(1.0), Expr::Number(2.0), Expr::Number(3.0)],
        }
    );
}

#[test]
fn parse_array_lit_single_column() {
    // `={1;2;3}` — 3 rows × 1 col.
    let result = parse_formula("={1;2;3}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 3,
            cols: 1,
            data: vec![Expr::Number(1.0), Expr::Number(2.0), Expr::Number(3.0)],
        }
    );
}

#[test]
fn parse_array_lit_2x2() {
    // `={1,2;3,4}` — 2×2, row-major: [1,2,3,4].
    let result = parse_formula("={1,2;3,4}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 2,
            cols: 2,
            data: vec![
                Expr::Number(1.0),
                Expr::Number(2.0),
                Expr::Number(3.0),
                Expr::Number(4.0),
            ],
        }
    );
}

#[test]
fn parse_array_lit_mixed_text_numbers() {
    // `={"a","b";1,2}` — mixed types in a 2×2 literal.
    let result = parse_formula("={\"a\",\"b\";1,2}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 2,
            cols: 2,
            data: vec![
                Expr::Text("a".into()),
                Expr::Text("b".into()),
                Expr::Number(1.0),
                Expr::Number(2.0),
            ],
        }
    );
}

#[test]
fn parse_array_lit_negate_number_allowed() {
    // `={-1, 2}` — unary minus over a number is allowed.
    let result = parse_formula("={-1, 2}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 1,
            cols: 2,
            data: vec![Expr::Negate(Box::new(Expr::Number(1.0))), Expr::Number(2.0),],
        }
    );
}

#[test]
fn parse_array_lit_bool() {
    let result = parse_formula("={TRUE,FALSE}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 1,
            cols: 2,
            data: vec![Expr::Bool(true), Expr::Bool(false)],
        }
    );
}

#[test]
fn parse_array_lit_error_literals_allowed() {
    let result = parse_formula("={#N/A,#CALC!}").unwrap();
    assert_eq!(
        result,
        Expr::ArrayLit {
            rows: 1,
            cols: 2,
            data: vec![
                Expr::Error(ValueError::NotAvailable),
                Expr::Error(ValueError::Calc),
            ],
        }
    );
}

#[test]
fn parse_array_lit_ragged_rejected() {
    // `={1,2;3}` — second row only has one column.
    assert!(parse_formula("={1,2;3}").is_none());
}

#[test]
fn parse_array_lit_cell_ref_rejected() {
    // `={A1, B1}` — cell refs are not allowed inside a literal.
    assert!(parse_formula("={A1, B1}").is_none());
}

#[test]
fn parse_array_lit_func_call_rejected() {
    // `={SUM(1)}` — function calls are not allowed inside a literal.
    assert!(parse_formula("={SUM(1)}").is_none());
}

#[test]
fn parse_array_lit_binop_rejected() {
    // `={1+1}` — even pure-literal arithmetic isn't a valid constant.
    assert!(parse_formula("={1+1}").is_none());
}

#[test]
fn parse_array_lit_nested_rejected() {
    // `={{1}}` — nested array literals are not valid Excel.
    assert!(parse_formula("={{1}}").is_none());
}

#[test]
fn parse_array_lit_inside_func_call() {
    // `=SUM({1,2,3})` parses with the literal as the SUM arg.
    let result = parse_formula("=SUM({1,2,3})").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::ArrayLit {
                rows: 1,
                cols: 3,
                data: vec![Expr::Number(1.0), Expr::Number(2.0), Expr::Number(3.0)],
            }],
        }
    );
}
