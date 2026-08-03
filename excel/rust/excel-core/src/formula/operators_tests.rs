//! `operators.rs` 的单元测试：运算符优先级与前后缀运算。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::cell::CellAddress;
use crate::formula::*;

#[test]
fn parse_addition() {
    assert_eq!(
        parse_formula("=A1+B1"),
        Some(Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
            right: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
        })
    );
}

#[test]
fn parse_multiplication_before_addition() {
    // =A1+B1*2 should be A1 + (B1 * 2)
    let result = parse_formula("=A1+B1*2").unwrap();
    assert_eq!(
        result,
        Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
            right: Box::new(Expr::BinOp {
                op: BinOperator::Mul,
                left: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
                right: Box::new(Expr::Number(2.0)),
            }),
        }
    );
}

#[test]
fn parse_negation() {
    assert_eq!(
        parse_formula("=-A1"),
        Some(Expr::Negate(Box::new(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::REL
        ))))
    );
}

/// 后缀 `%` 的优先级阶梯，三个组合钉死（Excel 运算符优先级表：
/// 一元负号 > `%` > `^` > `*` `/` > `+` `-`）。
#[test]
fn parse_percent_precedence_ladder() {
    // `=50%` —— 后缀一元，不是取模（Excel 没有取模运算符）。
    assert_eq!(
        parse_formula("=50%"),
        Some(Expr::Percent(Box::new(Expr::Number(50.0))))
    );
    // `=-50%` —— 负号优先级更高，落在里层；数值 -0.5。
    assert_eq!(
        parse_formula("=-50%"),
        Some(Expr::Percent(Box::new(Expr::Negate(Box::new(
            Expr::Number(50.0)
        )))))
    );
    // `=2^2%` —— `%` 比 `^` 紧，所以是 `2^(2%)` 而**不是** `(2^2)%`。
    assert_eq!(
        parse_formula("=2^2%"),
        Some(Expr::BinOp {
            op: BinOperator::Pow,
            left: Box::new(Expr::Number(2.0)),
            right: Box::new(Expr::Percent(Box::new(Expr::Number(2.0)))),
        })
    );
    // `=50%%` —— Excel 允许叠加，0.005。
    assert_eq!(
        parse_formula("=50%%"),
        Some(Expr::Percent(Box::new(Expr::Percent(Box::new(
            Expr::Number(50.0)
        )))))
    );
    // `=1+2%` —— `%` 只吃住右操作数。
    assert_eq!(
        parse_formula("=1+2%"),
        Some(Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::Number(1.0)),
            right: Box::new(Expr::Percent(Box::new(Expr::Number(2.0)))),
        })
    );
    // 括号里的整个表达式也能带 `%`。
    assert_eq!(
        parse_formula("=(1+2)%"),
        Some(Expr::Percent(Box::new(Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::Number(1.0)),
            right: Box::new(Expr::Number(2.0)),
        })))
    );
    // 单元格引用同样可以，`%` 不会被误当成 `#` 之类的后缀。
    assert_eq!(
        parse_formula("=A1%"),
        Some(Expr::Percent(Box::new(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::REL
        ))))
    );
}

#[test]
fn parse_division() {
    assert_eq!(
        parse_formula("=A1/B1"),
        Some(Expr::BinOp {
            op: BinOperator::Div,
            left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
            right: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
        })
    );
}

#[test]
fn parse_spaces() {
    assert_eq!(
        parse_formula("= A1 + B1 "),
        Some(Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
            right: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
        })
    );
}

#[test]
fn parse_complex_formula() {
    // =(A1+B1)/2
    let result = parse_formula("=(A1+B1)/2").unwrap();
    assert_eq!(
        result,
        Expr::BinOp {
            op: BinOperator::Div,
            left: Box::new(Expr::BinOp {
                op: BinOperator::Add,
                left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
                right: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
            }),
            right: Box::new(Expr::Number(2.0)),
        }
    );
}

#[test]
fn parse_spill_ref() {
    assert_eq!(
        parse_formula("=A1#"),
        Some(Expr::SpillRef(Box::new(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::REL
        ))))
    );
}

#[test]
fn spill_ref_does_not_swallow_error_literal_suffix() {
    assert!(parse_formula("=A1#CALC!").is_none());
}

#[test]
fn parse_cross_sheet_spill_ref() {
    assert_eq!(
        parse_formula("=Sheet2!A1#"),
        Some(Expr::SpillRef(Box::new(Expr::SheetRef {
            sheet: "Sheet2".into(),
            addr: CellAddress::new(0, 0),
            abs: RefAbs::REL,
        })))
    );
}

#[test]
fn parse_spill_rejects_range_anchor() {
    assert!(parse_formula("=A1:B2#").is_none());
}

#[test]
fn parse_absolute_spill_anchor() {
    assert_eq!(
        parse_formula("=$A$1#"),
        Some(Expr::SpillRef(Box::new(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::ABS
        ))))
    );
}

// ── Expr::Call (trailing-call chaining for LAMBDA invocation) ────

#[test]
fn parse_lambda_immediate_call_wraps_in_expr_call() {
    // `=LAMBDA(x, x*x)(5)` parses as Call(FuncCall("LAMBDA", ...), [5]).
    let result = parse_formula("=LAMBDA(x, x*x)(5)").unwrap();
    match result {
        Expr::Call(callee, args) => {
            match *callee {
                Expr::FuncCall {
                    name,
                    args: lam_args,
                } => {
                    assert_eq!(name, "LAMBDA");
                    assert_eq!(lam_args[0], Expr::Name("x".into()));
                }
                other => panic!("expected FuncCall callee, got {:?}", other),
            }
            assert_eq!(args, vec![Expr::Number(5.0)]);
        }
        other => panic!("expected Expr::Call, got {:?}", other),
    }
}

#[test]
fn parse_chained_call_wraps_each_application() {
    // `=LAMBDA(x, LAMBDA(y, x*y))(3)(4)` — two trailing calls
    // chain into Call(Call(FuncCall("LAMBDA",..), [3]), [4]).
    let result = parse_formula("=LAMBDA(x, LAMBDA(y, x*y))(3)(4)").unwrap();
    match result {
        Expr::Call(outer_callee, outer_args) => {
            assert_eq!(outer_args, vec![Expr::Number(4.0)]);
            match *outer_callee {
                Expr::Call(inner_callee, inner_args) => {
                    assert_eq!(inner_args, vec![Expr::Number(3.0)]);
                    assert!(matches!(*inner_callee, Expr::FuncCall { .. }));
                }
                other => panic!("expected nested Call, got {:?}", other),
            }
        }
        other => panic!("expected Expr::Call, got {:?}", other),
    }
}

#[test]
fn parse_trailing_call_on_name_wraps_in_expr_call() {
    // `=f(1, 2)` where `f` is a Name (no built-in by that name)
    // parses as Call(Name("f"), [1, 2]). This is the path stored
    // lambdas use when bound through LET and then immediately
    // invoked. NOTE: bare identifier "f" followed by "(" actually
    // parses as a FuncCall via the identifier branch — so this
    // test exercises an explicit Name produced inside a LET body
    // by other means rather than the surface `f(1,2)`. Skip this
    // exact assertion if the parser ambiguity surfaces; the
    // canonical immediate-invocation path is exercised in the
    // other parser tests above and the integration tests.
    //
    // To keep behavior verified, we instead confirm that a
    // *parenthesized* identifier wraps in Call:
    //   `=(f)(1, 2)` — parens deliberately disambiguate.
    let result = parse_formula("=(f)(1, 2)").unwrap();
    match result {
        Expr::Call(callee, args) => {
            assert_eq!(*callee, Expr::Name("f".into()));
            assert_eq!(args, vec![Expr::Number(1.0), Expr::Number(2.0)]);
        }
        other => panic!("expected Expr::Call, got {:?}", other),
    }
}
