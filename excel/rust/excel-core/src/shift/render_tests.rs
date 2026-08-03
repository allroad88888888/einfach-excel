//! `render.rs` 的单元测试：解析 → 渲染 → 再解析的往返不动点，以及 `$`
//! 绝对引用的逐字节回写。
//!
//! `#[path]` 挂在实现文件上，实现文件本身不背测试模块 —— 与
//! `formula/lexer_tests.rs` 同一套做法。

use super::*;
use crate::formula::parse_formula;

#[test]
fn render_roundtrip() {
    let original = "=SUM(A1:A10)+IF(B1>0,B1*2,0)";
    let parsed = parse_formula(original).unwrap();
    let rendered = render_formula(&parsed);
    // Re-parsing the rendered output produces the same AST.
    let reparsed = parse_formula(&rendered).unwrap();
    assert_eq!(parsed, reparsed);
}

// === Phase 2 Track G — whole-col / whole-row round-trips ===

#[test]
fn render_whole_col_roundtrip() {
    for syntax in ["=SUM(A:A)", "=SUM(A:C)", "=A:A", "=SUM(AA:AC)"] {
        let parsed = parse_formula(syntax).unwrap();
        let rendered = render_formula(&parsed);
        let reparsed = parse_formula(&rendered).unwrap();
        assert_eq!(parsed, reparsed, "round-trip {} -> {}", syntax, rendered);
    }
}

#[test]
fn render_whole_row_roundtrip() {
    for syntax in ["=SUM(1:1)", "=SUM(1:3)", "=SUM(100:200)"] {
        let parsed = parse_formula(syntax).unwrap();
        let rendered = render_formula(&parsed);
        let reparsed = parse_formula(&rendered).unwrap();
        assert_eq!(parsed, reparsed, "round-trip {} -> {}", syntax, rendered);
    }
}

#[test]
fn render_array_literal_roundtrip() {
    // Parse → render → parse yields the same AST for the
    // constant-array literal syntax. Covers single-row, single-col,
    // 2D, and embedded-in-SUM shapes.
    for syntax in [
        "={1,2,3}",
        "={1;2;3}",
        "={1,2;3,4}",
        "={-1,2}",
        "={#N/A,#CALC!}",
        "=SUM({10,20,30})",
    ] {
        let parsed = parse_formula(syntax).unwrap();
        let rendered = render_formula(&parsed);
        let reparsed = parse_formula(&rendered).unwrap();
        assert_eq!(parsed, reparsed, "round-trip {} -> {}", syntax, rendered);
    }
}
#[test]
fn render_multi_area_roundtrip() {
    // Multi-area parse → render → parse yields the same AST.
    for syntax in [
        "=AREAS((A1:B2,D5:E6))",
        "=AREAS((A1:B2,D5:E6,F1))",
        "=(A1,B2)",
    ] {
        let parsed = parse_formula(syntax).unwrap();
        let rendered = render_formula(&parsed);
        let reparsed = parse_formula(&rendered).unwrap();
        assert_eq!(parsed, reparsed, "round-trip {} -> {}", syntax, rendered);
    }
}
// ================= Absolute references (`$A$1`) round-trip =================

#[test]
fn render_absolute_refs_byte_exact() {
    // Requirement #2: a stored `$` form reads back with its `$` intact.
    // These simple refs carry no binop parens, so render is byte-exact
    // with the source (the hydrated retarget path re-renders via exactly
    // this function into `formula_texts` / `get_formula`).
    for s in [
        "=$A$1",
        "=$A1",
        "=A$1",
        "=A1",
        "=$A$2:$B$4",
        "=$A2:B$4",
        "=A1:$B$2",
        "=Sheet1!$A$1",
        "=Sheet1!$A$2:$B$4",
        "=$A:$C",
        "=A:$C",
        "=$1:$3",
        "=$A$1#",
    ] {
        let parsed = parse_formula(s).unwrap();
        assert_eq!(render_formula(&parsed), s, "byte round-trip for {s}");
    }
}

#[test]
fn render_absolute_refs_ast_roundtrip() {
    // Property: parse -> render -> parse == parse, across `$` combos
    // embedded in binops / function calls.
    for s in [
        "=$A$1+$B2*C$3",
        "=SUM($A$2:$B$4)",
        "=SUM($A2:B$4)",
        "=SUM(Sheet1!$A$1:$C$9)",
        "=SUM($A:$C)+SUM($1:$3)",
        "=IF($A$1>0,$B$1,C1)",
    ] {
        let parsed = parse_formula(s).unwrap();
        let rendered = render_formula(&parsed);
        let reparsed = parse_formula(&rendered).unwrap();
        assert_eq!(parsed, reparsed, "AST round-trip {s} -> {rendered}");
    }
}
