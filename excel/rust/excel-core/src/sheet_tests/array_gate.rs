//! 判定一条公式会不会产出数组（溢出候选闸门）。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::array_gate::ARRAY_FUNCTION_NAMES;
use super::super::*;

/// `expr_may_produce_array` binary-searches this list.
#[test]
fn array_function_names_sorted() {
    assert!(
        ARRAY_FUNCTION_NAMES.windows(2).all(|w| w[0] < w[1]),
        "ARRAY_FUNCTION_NAMES must stay ASCII-sorted and duplicate-free"
    );
}

/// The parse-free gate used by `install_bulk_spill_projections` must never
/// reject a source the AST gate would accept — a miss silently drops a
/// spill projection on the bulk-install path. Over-flagging is fine: the
/// candidate is parsed and then rejected by the AST gate.
#[test]
fn source_gate_is_superset_of_ast_gate() {
    const SOURCES: &[&str] = &[
        "=SEQUENCE(10)",
        "=sequence(10)",
        "=SEQUENCE(4,3)",
        "=SUM(SEQUENCE(5))",
        "=UNIQUE(A1:A9)",
        "=SORT(A1:A9)",
        "=SORTBY(A1:A9,B1:B9)",
        "=INDEX(A1:B3,2,)",
        "=FILTER(A1:A9,B1:B9>0)",
        "=MODE.MULT(A1:A9)",
        "=TRANSPOSE(A1:B2)",
        "=MAP(A1:A9,LAMBDA(x,x*2))",
        "={1,2,3}",
        "=-{1,2}",
        "=A1#",
        "=A1#+1",
        "=A1:A3*2",
        "=2*A1:A3",
        "=A1:A3&\"x\"",
        "=A1:A3=B1:B3",
        "=-A1:A3",
        "=Sheet2!A1:A3*2",
        "=A:A*2",
        // 宿主自定义公式（Wave 8）能返回 `Value::Array`，但名字在编译期
        // 不可知，静态表里永远不会有。两道门都靠「非内建名」放行它们，
        // 大小写、点号名、带参数的形态都要一致。
        "=MYGRID()",
        "=mygrid()",
        "=MY.GRID(A1)",
        "=SUM(MYGRID())",
        "=MYGRID(A1:A9)",
        // Non-array shapes — these may be flagged (over-approximation) but
        // must never make the two gates disagree in the unsafe direction.
        "=A1*2",
        "=SUM(A1:A9)",
        "=IF(A1>0,B1,C1)",
        "=SUM(A1:A9)/COUNT(A1:A9)",
        "=\"total: \"&A1",
        "=1+2",
        "",
        "=",
        "=#REF!",
    ];
    for src in SOURCES {
        let ast_says = parse_formula(src).is_some_and(|e| expr_may_produce_array(&e));
        if ast_says {
            assert!(
                source_may_produce_array(src),
                "source gate missed an array-producing source: {src:?}"
            );
        }
    }
}

/// The point of the source gate is that ordinary formulas never reach the
/// parser during a bulk install. Pinned so a future marker relaxation
/// can't quietly turn the install back into a parse-everything pass.
#[test]
fn source_gate_skips_ordinary_formulas() {
    for src in [
        "=A1*2",
        "=A1+B1",
        "=SUM(A1:A99)",
        "=AVERAGE(A1:A99)",
        "=IF(A1,B1,C1)",
        "=VLOOKUP(A1,B1:C9,2,FALSE)",
        "=CONCAT(A1,B1)",
        "=42",
    ] {
        assert!(
            !source_may_produce_array(src),
            "{src:?} must not become a spill-projection candidate"
        );
    }
}
