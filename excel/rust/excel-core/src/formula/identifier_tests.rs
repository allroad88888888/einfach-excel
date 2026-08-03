//! `identifier.rs` 的单元测试：标识符记号的分流。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::cell::CellAddress;
use crate::formula::*;

#[test]
fn parse_func_call() {
    let result = parse_formula("=SUM(A1,B1)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![
                Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL),
                Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL),
            ],
        }
    );
}

#[test]
fn parse_func_call_case_insensitive() {
    let result = parse_formula("=sum(A1)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)],
        }
    );
}

#[test]
fn parse_cross_sheet_ref() {
    let result = parse_formula("=Sheet2!A1").unwrap();
    assert_eq!(
        result,
        Expr::SheetRef {
            sheet: "Sheet2".into(),
            addr: CellAddress::new(0, 0),
            abs: RefAbs::REL,
        }
    );
}

#[test]
fn parse_cross_sheet_range() {
    let result = parse_formula("=SUM(Sheet2!A1:A100)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::SheetRange {
                sheet: "Sheet2".into(),
                start: CellAddress::new(0, 0),
                end: CellAddress::new(99, 0),
                unbounded: RangeBounds::None,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_cross_sheet_range_rejects_missing_end() {
    assert!(parse_formula("=SUM(Sheet2!A1:)").is_none());
}

#[test]
fn parse_cross_sheet_in_expression() {
    // Cross-sheet ref inside a binop. Sheet2!A1 + 5
    let result = parse_formula("=Sheet2!A1+5").unwrap();
    assert_eq!(
        result,
        Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::SheetRef {
                sheet: "Sheet2".into(),
                addr: CellAddress::new(0, 0),
                abs: RefAbs::REL,
            }),
            right: Box::new(Expr::Number(5.0)),
        }
    );
}

#[test]
fn cell_address_takes_precedence_over_sheet_ref() {
    // `A1` alone is a cell ref, not a sheet name. The bang disambiguates.
    let result = parse_formula("=A1").unwrap();
    assert!(matches!(result, Expr::CellRef(..)));
}

#[test]
fn parse_dotted_func_name() {
    // Excel 2010+ dotted aliases like RANK.EQ must parse as a single
    // function name (the dot is part of the identifier, not a stray
    // token between two refs).
    let result = parse_formula("=RANK.EQ(1,A1:A3)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "RANK.EQ".into(),
            args: vec![
                Expr::Number(1.0),
                Expr::Range {
                    start: CellAddress::new(0, 0),
                    end: CellAddress::new(2, 0),
                    unbounded: RangeBounds::None,
                    abs: RangeAbs::REL,
                },
            ],
        }
    );
}

#[test]
fn parse_dotted_func_name_multi_dot() {
    // PERCENTILE.INC is the canonical 2010+ rename of PERCENTILE.
    let result = parse_formula("=PERCENTILE.INC(A1:A3,0.5)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "PERCENTILE.INC".into(),
            args: vec![
                Expr::Range {
                    start: CellAddress::new(0, 0),
                    end: CellAddress::new(2, 0),
                    unbounded: RangeBounds::None,
                    abs: RangeAbs::REL,
                },
                Expr::Number(0.5),
            ],
        }
    );
}

#[test]
fn parse_decimal_regression() {
    // The dotted-identifier rule must NOT break decimal numbers, which
    // are routed through `parse_number` because identifiers must start
    // with an alpha char.
    assert_eq!(parse_formula("=1.5"), Some(Expr::Number(1.5)));
    assert_eq!(parse_formula("=0.25"), Some(Expr::Number(0.25)));
}

#[test]
fn parse_trailing_dot_in_identifier_rejected() {
    // `RANK.` (trailing dot with no continuation) must NOT parse as an
    // identifier called `RANK.`. The parser stops before the `.`,
    // leaving it for the caller — there's nothing else `.` can be at
    // the start of a token, so the formula as a whole fails to parse.
    assert!(parse_formula("=RANK.").is_none());
    // Even inside a function-call expression, the lone dot is fatal:
    assert!(parse_formula("=RANK.(1,A1:A3)").is_none());
}

#[test]
fn parse_consecutive_dots_in_identifier_rejected() {
    // `RANK..EQ` — the second dot has no preceding identifier char so
    // the rule stops the identifier at `RANK` and the second `.` is
    // not consumed → formula fails to parse.
    assert!(parse_formula("=RANK..EQ(1,A1:A3)").is_none());
}

#[test]
fn parse_bare_identifier_is_name() {
    // Bare identifier that isn't a cell ref / func call / TRUE/FALSE
    // surfaces as Expr::Name. The evaluator binds it via LET scope or
    // returns #NAME? if unbound.
    assert_eq!(parse_formula("=x"), Some(Expr::Name("x".into())));
    assert_eq!(parse_formula("=foo"), Some(Expr::Name("foo".into())));
    // Underscores allowed inside identifiers.
    assert_eq!(parse_formula("=my_var"), Some(Expr::Name("my_var".into())));
}

#[test]
fn parse_let_func_with_name_args() {
    // `LET` is a function call; its name args are Expr::Name nodes.
    let result = parse_formula("=LET(x, 5, x*x)").unwrap();
    let Expr::FuncCall { name, args } = result else {
        panic!("expected FuncCall");
    };
    assert_eq!(name, "LET");
    assert_eq!(args[0], Expr::Name("x".into()));
    assert_eq!(args[1], Expr::Number(5.0));
    // args[2] is x*x — BinOp with Name on both sides.
    match &args[2] {
        Expr::BinOp { op, left, right } => {
            assert_eq!(*op, BinOperator::Mul);
            assert_eq!(**left, Expr::Name("x".into()));
            assert_eq!(**right, Expr::Name("x".into()));
        }
        _ => panic!("expected BinOp"),
    }
}

#[test]
fn parse_decimal_still_works_with_name_fallback() {
    // The Expr::Name fallback added for LET must not capture decimals
    // — `1.5` routes through parse_number because identifiers must
    // start with an alpha char.
    assert_eq!(parse_formula("=1.5"), Some(Expr::Number(1.5)));
    assert_eq!(parse_formula("=.5"), Some(Expr::Number(0.5)));
    assert_eq!(parse_formula("=100.25"), Some(Expr::Number(100.25)));
}

#[test]
fn parse_nested_func() {
    let result = parse_formula("=SUM(A1,SUM(B1,C1))").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![
                Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL),
                Expr::FuncCall {
                    name: "SUM".into(),
                    args: vec![
                        Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL),
                        Expr::CellRef(CellAddress::new(0, 2), RefAbs::REL),
                    ],
                },
            ],
        }
    );
}

#[test]
fn parse_absolute_cross_sheet_ref_and_range() {
    assert_eq!(
        parse_formula("=Sheet1!$A$1"),
        Some(Expr::SheetRef {
            sheet: "Sheet1".into(),
            addr: CellAddress::new(0, 0),
            abs: RefAbs::ABS,
        })
    );
    assert_eq!(
        parse_formula("=SUM(Sheet1!$A$2:$B$4)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::SheetRange {
                sheet: "Sheet1".into(),
                start: CellAddress::new(1, 0),
                end: CellAddress::new(3, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::new(RefAbs::ABS, RefAbs::ABS),
            }],
        })
    );
}
