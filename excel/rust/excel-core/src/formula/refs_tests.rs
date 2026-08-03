//! `refs.rs` 的单元测试：引用的区间形态（含 `$` 绝对形式）。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `eval_regex_tests.rs` 同一套做法。

use crate::cell::CellAddress;
use crate::formula::*;

#[test]
fn parse_cell_ref() {
    assert_eq!(
        parse_formula("=A1"),
        Some(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL))
    );
}

#[test]
fn parse_range() {
    let result = parse_formula("=SUM(A1:B3)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(2, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_whole_col_range() {
    // `A:A` — start row sentinel 0, end row sentinel u32::MAX,
    // both cols pointing at column A (col index 0).
    let result = parse_formula("=SUM(A:A)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(u32::MAX, 0),
                unbounded: RangeBounds::Rows,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_whole_col_range_multi_col() {
    // `A:C` — three columns wide, every row.
    let result = parse_formula("=SUM(A:C)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(u32::MAX, 2),
                unbounded: RangeBounds::Rows,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_whole_row_range() {
    // `1:1` — row 1 (0-based row 0), every column.
    let result = parse_formula("=SUM(1:1)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(0, u32::MAX),
                unbounded: RangeBounds::Cols,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_whole_row_range_multi_row() {
    // `1:3` — rows 1 through 3, every column.
    let result = parse_formula("=SUM(1:3)").unwrap();
    assert_eq!(
        result,
        Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(2, u32::MAX),
                unbounded: RangeBounds::Cols,
                abs: RangeAbs::REL,
            }],
        }
    );
}

#[test]
fn parse_whole_col_range_bare_expr() {
    // `=A:A` (no wrapper function) is valid range syntax. The
    // standalone Range expression evaluates to InvalidValue at the
    // top level (per eval_expr_with_provider), but it must parse.
    let result = parse_formula("=A:A").unwrap();
    assert!(matches!(
        result,
        Expr::Range {
            unbounded: RangeBounds::Rows,
            ..
        }
    ));
}

#[test]
fn parse_dynamic_range_endpoint() {
    let result = parse_formula("=A1:INDEX(A:A,3)").unwrap();
    match result {
        Expr::DynamicRange { start, end } => {
            assert_eq!(*start, Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL));
            assert!(matches!(*end, Expr::FuncCall { .. }));
        }
        other => panic!("expected DynamicRange, got {:?}", other),
    }
}

#[test]
fn parse_dynamic_range_binds_tighter_than_multiply() {
    let result = parse_formula("=A1:INDEX(A:A,3)*2").unwrap();
    match result {
        Expr::BinOp {
            op: BinOperator::Mul,
            left,
            right,
        } => {
            assert!(matches!(*left, Expr::DynamicRange { .. }));
            assert_eq!(*right, Expr::Number(2.0));
        }
        other => panic!("expected multiply, got {:?}", other),
    }
}

// ================= Absolute references (`$A$1`) parsing =================
//
// Counter-example baseline (verified against the pre-change parser): the
// dispatch `match` sent `$` to `_ => None`, so EVERY one of the formulas
// below returned `parse_formula(..) == None` — a hard parse failure that
// surfaced as `Error(InvalidValue)` in the cell, not a wrong value. These
// assertions are the green side; they fail to even compile against the old
// single-field `CellRef`.
//
// 同组另外两条按「谁拥有被测产生式」分了家，结论与上面这段完全一样：跨表
// 绝对引用在 `identifier_tests.rs`，绝对 spill 锚点在 `operators_tests.rs`。

#[test]
fn parse_absolute_cell_ref_all_four_forms() {
    assert_eq!(
        parse_formula("=$A$1"),
        Some(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::new(true, true)
        ))
    );
    assert_eq!(
        parse_formula("=$A1"),
        Some(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::new(true, false)
        ))
    );
    assert_eq!(
        parse_formula("=A$1"),
        Some(Expr::CellRef(
            CellAddress::new(0, 0),
            RefAbs::new(false, true)
        ))
    );
    assert_eq!(
        parse_formula("=A1"),
        Some(Expr::CellRef(CellAddress::new(0, 0), RefAbs::REL))
    );
}

#[test]
fn parse_single_absolute_ref_in_expression() {
    // The canonical reported crash: `=$A$2+1` used to fail the WHOLE
    // parse. It must now be a normal BinOp with an absolute left operand.
    assert_eq!(
        parse_formula("=$A$2+1").unwrap(),
        Expr::BinOp {
            op: BinOperator::Add,
            left: Box::new(Expr::CellRef(CellAddress::new(1, 0), RefAbs::ABS)),
            right: Box::new(Expr::Number(1.0)),
        }
    );
}

#[test]
fn parse_absolute_range_corner_combinations() {
    // Both corners absolute.
    assert_eq!(
        parse_formula("=SUM($A$2:$B$4)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(1, 0),
                end: CellAddress::new(3, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::new(RefAbs::ABS, RefAbs::ABS),
            }],
        })
    );
    // Mixed: `$A2:B$4` — col-abs start, row-abs end.
    assert_eq!(
        parse_formula("=SUM($A2:B$4)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(1, 0),
                end: CellAddress::new(3, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::new(RefAbs::new(true, false), RefAbs::new(false, true)),
            }],
        })
    );
}

#[test]
fn parse_absolute_whole_col_and_whole_row() {
    assert_eq!(
        parse_formula("=SUM($A:$C)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(u32::MAX, 2),
                unbounded: RangeBounds::Rows,
                abs: RangeAbs::new(RefAbs::new(true, false), RefAbs::new(true, false)),
            }],
        })
    );
    assert_eq!(
        parse_formula("=SUM($1:$3)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(2, u32::MAX),
                unbounded: RangeBounds::Cols,
                abs: RangeAbs::new(RefAbs::new(false, true), RefAbs::new(false, true)),
            }],
        })
    );
    // Mixed whole-column: relative start, absolute end.
    assert_eq!(
        parse_formula("=SUM(A:$C)"),
        Some(Expr::FuncCall {
            name: "SUM".into(),
            args: vec![Expr::Range {
                start: CellAddress::new(0, 0),
                end: CellAddress::new(u32::MAX, 2),
                unbounded: RangeBounds::Rows,
                abs: RangeAbs::new(RefAbs::REL, RefAbs::new(true, false)),
            }],
        })
    );
}

#[test]
fn dollar_does_not_disturb_names_numbers_or_relative_refs() {
    // Regression guard: relative forms and non-reference tokens are
    // unchanged, and a stray `$` fails cleanly instead of mis-parsing.
    assert_eq!(parse_formula("=x"), Some(Expr::Name("x".into())));
    assert_eq!(parse_formula("=A1B"), Some(Expr::Name("A1B".into())));
    assert_eq!(parse_formula("=1.5"), Some(Expr::Number(1.5)));
    assert!(parse_formula("=$").is_none());
    assert!(parse_formula("=$5").is_none());
    assert!(parse_formula("=$Z").is_none());
}
