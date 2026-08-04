//! 结构编辑（插删行列）之后，按调用方给的坐标映射重写 AST 里的每一个地址。

use super::edit::{REF_INVALID_COL, REF_INVALID_ROW};
use crate::cell::CellAddress;
use crate::formula::{Expr, RangeBounds};

/// Walk an AST applying `f` to every CellRef / Range corner address.
/// Returns a new AST. Used by row/col insert/delete to retarget formulas.
///
/// Whole-column / whole-row ranges are INVARIANT on their unbounded axis:
/// inserting a row above column A's `A:A` reference doesn't move the
/// column corner. We apply `f` to a synthesized address that keeps the
/// unbounded axis at its sentinel, then restore the sentinel after the
/// shift so any per-axis mutation in `f` (e.g. a `col_insert` shift) is
/// still seen by the bounded axis.
pub fn map_addrs(expr: &Expr, f: &dyn Fn(CellAddress) -> CellAddress) -> Expr {
    match expr {
        Expr::Omitted | Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) => {
            expr.clone()
        }
        Expr::CellRef(addr, abs) => Expr::CellRef(f(*addr), *abs),
        Expr::Range {
            start,
            end,
            unbounded,
            abs,
        } => {
            let (new_start, new_end) = shift_range_corners(*start, *end, *unbounded, &|a| f(a));
            Expr::Range {
                start: new_start,
                end: new_end,
                unbounded: *unbounded,
                abs: *abs,
            }
        }
        // Cross-sheet refs aren't shifted by within-sheet structural edits.
        Expr::SheetRef { .. } | Expr::SheetRange { .. } => expr.clone(),
        Expr::SpillRef(anchor) => Expr::SpillRef(Box::new(map_addrs(anchor, f))),
        Expr::DynamicRange { start, end } => Expr::DynamicRange {
            start: Box::new(map_addrs(start, f)),
            end: Box::new(map_addrs(end, f)),
        },
        Expr::Negate(inner) => Expr::Negate(Box::new(map_addrs(inner, f))),
        Expr::Percent(inner) => Expr::Percent(Box::new(map_addrs(inner, f))),
        Expr::BinOp { op, left, right } => Expr::BinOp {
            op: *op,
            left: Box::new(map_addrs(left, f)),
            right: Box::new(map_addrs(right, f)),
        },
        Expr::FuncCall { name, args } => Expr::FuncCall {
            name: name.clone(),
            args: args.iter().map(|a| map_addrs(a, f)).collect(),
        },
        // LET / future-LAMBDA bindings carry no cell address; copy as-is.
        Expr::Name(_) => expr.clone(),
        // Immediate-call form: walk both the callee subtree and the
        // argument list. The callee can itself contain CellRefs (e.g.
        // `LAMBDA(x, A1+x)(5)` keeps the `A1` reference under the
        // callee's body), and arg expressions can too.
        Expr::Call(callee, args) => Expr::Call(
            Box::new(map_addrs(callee, f)),
            args.iter().map(|a| map_addrs(a, f)).collect(),
        ),
        // Constant-array literal: cells are restricted to literals at
        // parse time, so there are no addresses to retarget. Clone the
        // node as-is.
        Expr::ArrayLit { .. } => expr.clone(),
        // Multi-area: every part is a reference subject to retargeting.
        Expr::MultiArea(parts) => Expr::MultiArea(parts.iter().map(|p| map_addrs(p, f)).collect()),
        // Structured (Table) reference: carries no A1 coordinates — it is
        // resolved against the registry at eval time, and structural edits
        // follow the Table via the registry (design doc §5.2 / §4.3), not by
        // rewriting this node. Transparent.
        Expr::TableRef { .. } => expr.clone(),
    }
}

/// Apply `f` only to the bounded axis of a Range corner, leaving the
/// unbounded axis pinned to its sentinel (`0` on start, `u32::MAX` on
/// end). Used by `map_addrs` so a row-insert never tries to shift the
/// sentinel into `u32::MAX + count` (which would overflow).
fn shift_range_corners(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
    f: &dyn Fn(CellAddress) -> CellAddress,
) -> (CellAddress, CellAddress) {
    if matches!(unbounded, RangeBounds::None) {
        return (f(start), f(end));
    }
    // Build a synthetic "shiftable" CellAddress where the unbounded axis
    // is replaced by a benign value (row 0 / col 0), apply f, then put
    // back the sentinel on the unbounded axis.
    let rows_un = unbounded.rows_unbounded();
    let cols_un = unbounded.cols_unbounded();
    let synth_start = CellAddress::new(
        if rows_un { 0 } else { start.row },
        if cols_un { 0 } else { start.col },
    );
    let synth_end = CellAddress::new(
        if rows_un { 0 } else { end.row },
        if cols_un { 0 } else { end.col },
    );
    let shifted_start = f(synth_start);
    let shifted_end = f(synth_end);
    // If the bounded axis got shifted to the #REF! sentinel, leave it
    // there (eval will produce #REF!). Otherwise pin the unbounded axis
    // back to its sentinel.
    let new_start = CellAddress::new(
        if rows_un { 0 } else { shifted_start.row },
        if cols_un { 0 } else { shifted_start.col },
    );
    let new_end = CellAddress::new(
        if rows_un { u32::MAX } else { shifted_end.row },
        if cols_un { u32::MAX } else { shifted_end.col },
    );
    // Propagate #REF! invalidity from the bounded axis: if the shifted
    // bounded corner came back as REF_INVALID_* (column deletion ate the
    // referenced column), surface that sentinel on the whole corner so
    // `contains_invalid_ref` can detect it on the bounded axis.
    let new_start = if !rows_un && shifted_start.row == REF_INVALID_ROW {
        CellAddress::new(REF_INVALID_ROW, new_start.col)
    } else if !cols_un && shifted_start.col == REF_INVALID_COL {
        CellAddress::new(new_start.row, REF_INVALID_COL)
    } else {
        new_start
    };
    let new_end = if !rows_un && shifted_end.row == REF_INVALID_ROW {
        CellAddress::new(REF_INVALID_ROW, new_end.col)
    } else if !cols_un && shifted_end.col == REF_INVALID_COL {
        CellAddress::new(new_end.row, REF_INVALID_COL)
    } else {
        new_end
    };
    (new_start, new_end)
}

#[cfg(test)]
#[path = "retarget_tests.rs"]
mod tests;
