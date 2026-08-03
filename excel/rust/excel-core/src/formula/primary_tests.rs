//! `primary.rs` 的单元测试：`(` 开头的分组表达式与多区域引用。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::cell::CellAddress;
use crate::formula::*;

#[test]
fn parse_parentheses() {
    // =(A1+B1)*2
    let result = parse_formula("=(A1+B1)*2").unwrap();
    assert_eq!(
        result,
        Expr::BinOp {
            op: BinOperator::Mul,
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
fn parse_single_paren_ref_strips_parens() {
    // `=(A1)` — single ref in parens is just the cell ref, NOT a
    // single-element MultiArea.
    assert_eq!(
        parse_formula("=(A1)"),
        Some(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL))
    );
}

#[test]
fn parse_paren_binop_still_grouped() {
    // `=(1+2)` — paren'd binop survives as a grouped expression
    // (not a MultiArea). The multi-area detection only kicks in
    // when a `,` follows the first inner expr.
    let result = parse_formula("=(1+2)").unwrap();
    assert!(matches!(result, Expr::BinOp { .. }));
}

#[test]
fn parse_paren_addition_is_binop() {
    // `=(A1+B1)` must keep parsing as a BinOp — the addition takes
    // precedence over any multi-area interpretation. (The first
    // inner expr is `A1+B1` and no comma follows, so the path is
    // the grouped-expression path.)
    let result = parse_formula("=(A1+B1)").unwrap();
    assert_eq!(
        result,
        Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL)),
            right: Box::new(Expr::CellRef(CellAddress::new(0, 1), RefAbs::REL)),
        }
    );
}

// === Excel multi-area reference syntax: `(A1:B2, D5:E6)` ===

#[test]
fn parse_multi_area_two_ranges() {
    // `=(A1:B2, D5)` — multi-area with two refs (Range + CellRef).
    let result = parse_formula("=(A1:B2, D5)").unwrap();
    assert_eq!(
        result,
        Expr::MultiArea(vec![
            Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(1, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::REL,
            },
            Expr::CellRef(CellAddress::new(4, 3), RefAbs::REL),
        ])
    );
}

#[test]
fn parse_multi_area_three_parts() {
    // `=(A1:B2, D5:E6, F1)` — three-part multi-area.
    let result = parse_formula("=(A1:B2, D5:E6, F1)").unwrap();
    let Expr::MultiArea(parts) = result else {
        panic!("expected MultiArea");
    };
    assert_eq!(parts.len(), 3);
    assert!(matches!(parts[0], Expr::Range { .. }));
    assert!(matches!(parts[1], Expr::Range { .. }));
    assert_eq!(parts[2], Expr::CellRef(CellAddress::new(0, 5), RefAbs::REL));
}

#[test]
fn parse_multi_area_rejects_non_ref_in_list() {
    // `=(A1, 1+2)` — the second part isn't a reference, so the
    // multi-area path rejects it. The grouped-expression path
    // can't take over either (a comma never appears in a normal
    // parenthesized binop). Overall parse fails.
    assert!(parse_formula("=(A1, 1+2)").is_none());
}

#[test]
fn parse_multi_area_inside_func_call() {
    // `=SUM((A1:B2, D5:E6))` — the function arg is a multi-area.
    // SUM's eval will surface #VALUE! (multi-area isn't a normal
    // arg shape) but the formula must parse.
    let result = parse_formula("=SUM((A1:B2, D5:E6))").unwrap();
    let Expr::FuncCall { name, args } = result else {
        panic!("expected FuncCall");
    };
    assert_eq!(name, "SUM");
    assert_eq!(args.len(), 1);
    assert!(matches!(args[0], Expr::MultiArea(_)));
}

#[test]
fn parse_areas_func_call_with_multi_area() {
    // `=AREAS((A1:B2, D5:E6))` — argument is a MultiArea.
    let result = parse_formula("=AREAS((A1:B2, D5:E6))").unwrap();
    let Expr::FuncCall { name, args } = result else {
        panic!("expected FuncCall");
    };
    assert_eq!(name, "AREAS");
    match &args[0] {
        Expr::MultiArea(parts) => assert_eq!(parts.len(), 2),
        other => panic!("expected MultiArea, got {:?}", other),
    }
}

#[test]
fn parse_multi_area_with_cross_sheet_ref() {
    // `=(Sheet2!A1, B2)` — multi-area with a cross-sheet part.
    let result = parse_formula("=(Sheet2!A1, B2)").unwrap();
    let Expr::MultiArea(parts) = result else {
        panic!("expected MultiArea");
    };
    assert_eq!(parts.len(), 2);
    assert!(matches!(parts[0], Expr::SheetRef { .. }));
    assert_eq!(parts[1], Expr::CellRef(CellAddress::new(1, 1), RefAbs::REL));
}
