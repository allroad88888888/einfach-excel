//! 从一棵公式语法树里收集它引用到的地址与区域。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Walk the AST and collect every `Expr::Range` as a typed `CellRange`,
/// without expanding it to individual cells. Mirror of `collect_refs`
/// that handles only ranges. Used by `set_formula` / `BulkLoader` to retain
/// range identity for static cycle checks and structural retargeting without
/// expanding large ranges into individual cells.
pub(super) fn collect_range_refs(expr: &Expr) -> HashSet<CellRange> {
    let mut out = HashSet::new();
    collect_range_refs_into(expr, &mut out);
    out
}

pub(super) fn collect_range_refs_into(expr: &Expr, out: &mut HashSet<CellRange>) {
    match expr {
        Expr::Range { start, end, .. } => {
            // Normalize so transposed corners hash to the same entry —
            // a `SUM(A1:B2)` and `SUM(B2:A1)` share one dep entry.
            //
            // For whole-col / whole-row ranges the start/end already carry
            // the sentinel coords (0 and u32::MAX) on the unbounded axis,
            // so the resulting CellRange spans the entire sheet on that
            // axis. Formula evaluation maps that geometry to lazy Store
            // band/column/sheet roots without expanding the coordinate space.
            out.insert(CellRange::new(*start, *end).normalize());
        }
        Expr::BinOp { left, right, .. } => {
            collect_range_refs_into(left, out);
            collect_range_refs_into(right, out);
        }
        Expr::Negate(inner) | Expr::Percent(inner) => collect_range_refs_into(inner, out),
        Expr::FuncCall { args, .. } => {
            // FuncCall covers `IF` and friends: every branch arg is
            // descended into so a range hidden inside an unselected
            // branch still registers as a range dep.
            for a in args {
                collect_range_refs_into(a, out);
            }
        }
        // CellRef goes through the point-cell `deps` path; SheetRef is
        // cross-sheet and tracked at the workbook layer; literals have
        // no deps. LET-bound names resolve at eval time against the
        // local scope, not against the cell graph.
        Expr::CellRef(..)
        | Expr::SheetRef { .. }
        | Expr::SheetRange { .. }
        // 空占位实参没有地址。
        | Expr::Omitted
        | Expr::Number(_)
        | Expr::Text(_)
        | Expr::Bool(_)
        | Expr::Error(_)
        | Expr::Name(_) => {}
        Expr::SpillRef(anchor) => collect_range_refs_into(anchor, out),
        Expr::DynamicRange { start, end } => {
            collect_range_refs_into(start, out);
            collect_range_refs_into(end, out);
        }
        // Immediate-call form — descend into callee + args so ranges
        // hidden inside the lambda body or arg list still register.
        Expr::Call(callee, args) => {
            collect_range_refs_into(callee, out);
            for a in args {
                collect_range_refs_into(a, out);
            }
        }
        // Constant-array literal: parser rejects any range / cell ref
        // inside, so there are no dependencies to register.
        Expr::ArrayLit { .. } => {}
        // Multi-area: every part is a reference; descend into each so
        // ranges inside the union register as deps.
        Expr::MultiArea(parts) => {
            for p in parts {
                collect_range_refs_into(p, out);
            }
        }
        // Structured (Table) reference contributes NO static range (design
        // doc §5.2): it resolves dynamically, and its reactive edges come
        // from the facade reads its resolved range performs at eval time —
        // same as `SpillRef` / `DynamicRange` / `OFFSET`.
        Expr::TableRef { .. } => {}
    }
}

/// Walk the AST and append every referenced cell address into `out`.
/// Used by static cycle detection (B.2). Free function so it can run
/// without borrowing `&self.interior.formula_exprs`.
///
/// Whole-column / whole-row ranges (`A:A`, `1:1`) are NOT expanded into
/// individual cells here — that would push the entire coordinate space
/// (`u32::MAX` rows or cols) into the dep vec. Track G's contract: the
/// unbounded range remains typed in `static_ranges`; cycle detection walks
/// materialized formulas within it, while runtime invalidation is owned by
/// Store geometry roots.
pub(super) fn collect_refs(expr: &Expr, out: &mut Vec<CellAddress>) {
    match expr {
        Expr::CellRef(addr, _) => out.push(*addr),
        Expr::Range {
            start,
            end,
            unbounded,
            ..
        } => {
            // Skip expansion for unbounded ranges — the row/col bound would
            // be u32::MAX. `collect_range_refs` retains the typed range.
            if !matches!(unbounded, RangeBounds::None) {
                return;
            }
            let min_row = start.row.min(end.row);
            let max_row = start.row.max(end.row);
            let min_col = start.col.min(end.col);
            let max_col = start.col.max(end.col);
            for row in min_row..=max_row {
                for col in min_col..=max_col {
                    out.push(CellAddress::new(row, col));
                }
            }
        }
        Expr::BinOp { left, right, .. } => {
            collect_refs(left, out);
            collect_refs(right, out);
        }
        Expr::Negate(inner) | Expr::Percent(inner) => collect_refs(inner, out),
        Expr::FuncCall { args, .. } => {
            for a in args {
                collect_refs(a, out);
            }
        }
        // Cross-sheet refs are out-of-scope for static cycle detection on
        // this sheet (cross-sheet cycles need workbook-level analysis).
        Expr::SheetRef { .. } | Expr::SheetRange { .. } => {}
        Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) | Expr::Omitted => {}
        // LET-bound names don't reference cells.
        Expr::Name(_) => {}
        Expr::SpillRef(anchor) => collect_refs(anchor, out),
        Expr::DynamicRange { start, end } => {
            collect_refs(start, out);
            collect_refs(end, out);
        }
        // Immediate-call form — descend into callee + args.
        Expr::Call(callee, args) => {
            collect_refs(callee, out);
            for a in args {
                collect_refs(a, out);
            }
        }
        // Constant-array literal carries no cell references.
        Expr::ArrayLit { .. } => {}
        // Multi-area: descend into every inner ref so static cycle
        // detection sees every cell mentioned in the union.
        Expr::MultiArea(parts) => {
            for p in parts {
                collect_refs(p, out);
            }
        }
        // Structured (Table) reference has no static A1 addresses (design
        // doc §5.2); it can't participate in static cycle detection.
        Expr::TableRef { .. } => {}
    }
}
