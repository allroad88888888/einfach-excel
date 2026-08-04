//! `delta.rs` 的单元测试：复制粘贴的增量平移，以及平移结果回渲染成的文本。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `formula/lexer_tests.rs` 同一套做法。

use super::*;
use crate::formula::parse_formula;
use crate::shift::render_formula;

fn shifted(input: &str, drow: i32, dcol: i32) -> String {
    let expr = parse_formula(input).expect("parse");
    let shifted = shift_refs(&expr, drow, dcol).expect("shift");
    render_formula(&shifted)
}

#[test]
fn shift_simple_ref_down() {
    assert_eq!(shifted("=A1", 1, 0), "=A2");
}

#[test]
fn shift_simple_ref_right() {
    assert_eq!(shifted("=A1", 0, 1), "=B1");
}

#[test]
fn shift_range() {
    assert_eq!(shifted("=SUM(A1:B2)", 1, 1), "=SUM(B2:C3)");
}

#[test]
fn shift_function_call() {
    assert_eq!(shifted("=IF(A1>0,A1,B1)", 0, 1), "=IF((B1>0),B1,C1)");
}

#[test]
fn shift_negative_oob_errors() {
    let expr = parse_formula("=A1").unwrap();
    assert!(shift_refs(&expr, -1, 0).is_err());
}
#[test]
fn shift_whole_col_invariant_under_row_shift() {
    // Whole-column ref stays put when shifted down — the column
    // corner is invariant on the row axis.
    assert_eq!(shifted("=SUM(A:A)", 5, 0), "=SUM(A:A)");
    // But shifting right moves the bounded column.
    assert_eq!(shifted("=SUM(A:A)", 0, 1), "=SUM(B:B)");
}

#[test]
fn shift_whole_row_invariant_under_col_shift() {
    // Whole-row ref stays put when shifted right.
    assert_eq!(shifted("=SUM(1:1)", 0, 5), "=SUM(1:1)");
    // But shifting down moves the bounded row.
    assert_eq!(shifted("=SUM(1:1)", 2, 0), "=SUM(3:3)");
}
#[test]
fn shift_multi_area_shifts_each_part() {
    // Multi-area shifts every inner reference by the same delta.
    assert_eq!(shifted("=AREAS((A1:B2,D5))", 1, 1), "=AREAS((B2:C3,E6))");
}
