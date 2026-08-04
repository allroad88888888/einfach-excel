//! 复制粘贴 / 自动填充：把 AST 里的每一个地址按 `(drow, dcol)` 增量平移。

use crate::cell::CellAddress;
use crate::formula::{Expr, RangeBounds};

/// Shift every cell reference in an AST by the given (drow, dcol) delta.
/// Returns Err when a shift would push a reference out of bounds (negative).
/// Used by copy-paste so `=A1` copied from B1 to B2 becomes `=A2` (drow=1).
///
/// Range references shift both corners by the same delta. For whole-col /
/// whole-row ranges, only the bounded axis shifts (an `A:A` copied right
/// becomes `B:B`; shifted down it stays `A:A`).
pub fn shift_refs(expr: &Expr, drow: i32, dcol: i32) -> Result<Expr, ()> {
    Ok(match expr {
        Expr::Omitted | Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) => {
            expr.clone()
        }
        Expr::CellRef(addr, abs) => Expr::CellRef(shift_addr(*addr, drow, dcol)?, *abs),
        Expr::Range {
            start,
            end,
            unbounded,
            abs,
        } => {
            let (s, e) = shift_range_corners_delta(*start, *end, *unbounded, drow, dcol)?;
            Expr::Range {
                start: s,
                end: e,
                unbounded: *unbounded,
                abs: *abs,
            }
        }
        // Cross-sheet refs aren't shifted on copy/paste — they point to a
        // fixed location on a different sheet regardless of paste target.
        Expr::SheetRef { .. } | Expr::SheetRange { .. } => expr.clone(),
        Expr::SpillRef(anchor) => Expr::SpillRef(Box::new(shift_refs(anchor, drow, dcol)?)),
        Expr::DynamicRange { start, end } => Expr::DynamicRange {
            start: Box::new(shift_refs(start, drow, dcol)?),
            end: Box::new(shift_refs(end, drow, dcol)?),
        },
        Expr::Negate(inner) => Expr::Negate(Box::new(shift_refs(inner, drow, dcol)?)),
        Expr::Percent(inner) => Expr::Percent(Box::new(shift_refs(inner, drow, dcol)?)),
        Expr::BinOp { op, left, right } => Expr::BinOp {
            op: *op,
            left: Box::new(shift_refs(left, drow, dcol)?),
            right: Box::new(shift_refs(right, drow, dcol)?),
        },
        Expr::FuncCall { name, args } => Expr::FuncCall {
            name: name.clone(),
            args: args
                .iter()
                .map(|a| shift_refs(a, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        },
        // LET binding names carry no cell address; copy as-is.
        Expr::Name(_) => expr.clone(),
        // Immediate-call form mirrors FuncCall — walk callee + args.
        Expr::Call(callee, args) => Expr::Call(
            Box::new(shift_refs(callee, drow, dcol)?),
            args.iter()
                .map(|a| shift_refs(a, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        // Constant-array literal: no addresses to shift; clone as-is.
        Expr::ArrayLit { .. } => expr.clone(),
        // Multi-area: shift every inner reference.
        Expr::MultiArea(parts) => Expr::MultiArea(
            parts
                .iter()
                .map(|p| shift_refs(p, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        // Structured (Table) reference: no A1 coordinates to shift on
        // copy/paste — it re-resolves by name at the paste target. Clone.
        Expr::TableRef { .. } => expr.clone(),
    })
}

fn shift_addr(addr: CellAddress, drow: i32, dcol: i32) -> Result<CellAddress, ()> {
    let row = (addr.row as i32) + drow;
    let col = (addr.col as i32) + dcol;
    if row < 0 || col < 0 {
        return Err(());
    }
    Ok(CellAddress::new(row as u32, col as u32))
}

/// Delta-shift the two corners of a Range, honoring the unbounded axes
/// (those stay pinned at sentinel values; no overflow on `u32::MAX +
/// drow`).
fn shift_range_corners_delta(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
    drow: i32,
    dcol: i32,
) -> Result<(CellAddress, CellAddress), ()> {
    if matches!(unbounded, RangeBounds::None) {
        return Ok((shift_addr(start, drow, dcol)?, shift_addr(end, drow, dcol)?));
    }
    let rows_un = unbounded.rows_unbounded();
    let cols_un = unbounded.cols_unbounded();
    // Only shift the bounded axis.
    let new_start_row = if rows_un {
        0
    } else {
        let r = (start.row as i32) + drow;
        if r < 0 {
            return Err(());
        }
        r as u32
    };
    let new_end_row = if rows_un {
        u32::MAX
    } else {
        let r = (end.row as i32) + drow;
        if r < 0 {
            return Err(());
        }
        r as u32
    };
    let new_start_col = if cols_un {
        0
    } else {
        let c = (start.col as i32) + dcol;
        if c < 0 {
            return Err(());
        }
        c as u32
    };
    let new_end_col = if cols_un {
        u32::MAX
    } else {
        let c = (end.col as i32) + dcol;
        if c < 0 {
            return Err(());
        }
        c as u32
    };
    Ok((
        CellAddress::new(new_start_row, new_start_col),
        CellAddress::new(new_end_row, new_end_col),
    ))
}

#[cfg(test)]
#[path = "delta_tests.rs"]
mod tests;
