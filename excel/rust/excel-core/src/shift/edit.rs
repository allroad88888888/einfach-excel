//! 「一次插删行列编辑」这个抽象：它是什么形状，它把单个坐标映射到哪里，
//! 以及目标被删掉时留下的 `#REF!` 哨兵长什么样、怎么在 AST 里认出来。

use crate::cell::CellAddress;
use crate::formula::{Expr, RangeBounds};

/// What to do with a CellRef whose target was deleted by a structural edit.
///
/// `Invalid` becomes `#REF!` at eval time. We mark it via a sentinel
/// (row=u32::MAX, col=u32::MAX) so the AST shape is preserved — the eval
/// layer knows to short-circuit when it sees that address.
pub const REF_INVALID_ROW: u32 = u32::MAX;
pub const REF_INVALID_COL: u32 = u32::MAX;

pub(super) fn is_invalid(addr: CellAddress) -> bool {
    addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL
}

pub(super) fn range_has_invalid_ref(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
) -> bool {
    let row_invalid = if unbounded.rows_unbounded() {
        false
    } else {
        start.row == REF_INVALID_ROW || end.row == REF_INVALID_ROW
    };
    let col_invalid = if unbounded.cols_unbounded() {
        false
    } else {
        start.col == REF_INVALID_COL || end.col == REF_INVALID_COL
    };
    row_invalid || col_invalid
}

/// Returns true if the AST contains any invalid (#REF!) cell reference,
/// e.g. left over from a row/column delete that took out a cell the
/// formula was reading.
pub fn contains_invalid_ref(expr: &Expr) -> bool {
    match expr {
        Expr::CellRef(addr, _) => is_invalid(*addr),
        Expr::Range {
            start,
            end,
            unbounded,
            ..
        } => range_has_invalid_ref(*start, *end, *unbounded),
        Expr::SheetRef { addr, .. } => is_invalid(*addr),
        Expr::SheetRange {
            start,
            end,
            unbounded,
            ..
        } => range_has_invalid_ref(*start, *end, *unbounded),
        Expr::Negate(inner) | Expr::Percent(inner) => contains_invalid_ref(inner),
        Expr::BinOp { left, right, .. } => {
            contains_invalid_ref(left) || contains_invalid_ref(right)
        }
        Expr::FuncCall { args, .. } => args.iter().any(contains_invalid_ref),
        Expr::SpillRef(anchor) => contains_invalid_ref(anchor),
        Expr::DynamicRange { start, end } => {
            contains_invalid_ref(start) || contains_invalid_ref(end)
        }
        // Constant-array literal: the parser already rejected any cell
        // ref / range / func call inside, so the elements can't carry a
        // #REF! sentinel.
        Expr::ArrayLit { .. } => false,
        // Multi-area: every part is a reference, so a #REF! in any of
        // them propagates the same way it would for a bare ref.
        Expr::MultiArea(parts) => parts.iter().any(contains_invalid_ref),
        _ => false,
    }
}

/// Adjust a single address for a row insertion at `at` (0-based) of `count`
/// rows. References at or below `at` shift down by `count`. References
/// above `at` are unchanged.
pub fn shift_addr_row_insert(addr: CellAddress, at: u32, count: u32) -> CellAddress {
    if is_invalid(addr) || addr.row < at {
        return addr;
    }
    CellAddress::new(addr.row + count, addr.col)
}

/// Adjust a single address for a row deletion of `count` rows starting at
/// `at`. Returns the invalid sentinel when the row was inside the deleted
/// range so eval can produce #REF!.
pub fn shift_addr_row_delete(addr: CellAddress, at: u32, count: u32) -> CellAddress {
    if is_invalid(addr) {
        return addr;
    }
    if addr.row < at {
        addr
    } else if addr.row < at + count {
        CellAddress::new(REF_INVALID_ROW, REF_INVALID_COL)
    } else {
        CellAddress::new(addr.row - count, addr.col)
    }
}

pub fn shift_addr_col_insert(addr: CellAddress, at: u32, count: u32) -> CellAddress {
    if is_invalid(addr) || addr.col < at {
        return addr;
    }
    CellAddress::new(addr.row, addr.col + count)
}

pub fn shift_addr_col_delete(addr: CellAddress, at: u32, count: u32) -> CellAddress {
    if is_invalid(addr) {
        return addr;
    }
    if addr.col < at {
        addr
    } else if addr.col < at + count {
        CellAddress::new(REF_INVALID_ROW, REF_INVALID_COL)
    } else {
        CellAddress::new(addr.row, addr.col - count)
    }
}

/// Structural-edit descriptor shared by the hydrated AST retarget
/// (`Sheet::retarget_formula_refs`) and the lazy parked-source rewrite
/// (`rewrite_parked_source`). Carrying the edit (instead of a bare
/// `Fn(CellAddress) -> CellAddress`) lets both paths answer
/// "does this edit even touch coordinate X?" without re-deriving the
/// axis from closure behavior.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShiftEdit {
    RowInsert { at: u32, count: u32 },
    RowDelete { at: u32, count: u32 },
    ColInsert { at: u32, count: u32 },
    ColDelete { at: u32, count: u32 },
}

impl ShiftEdit {
    /// Apply the edit's address mapping — exactly the `shift_addr_*`
    /// function the structural ops used to pass as a closure.
    pub fn apply(&self, addr: CellAddress) -> CellAddress {
        match *self {
            ShiftEdit::RowInsert { at, count } => shift_addr_row_insert(addr, at, count),
            ShiftEdit::RowDelete { at, count } => shift_addr_row_delete(addr, at, count),
            ShiftEdit::ColInsert { at, count } => shift_addr_col_insert(addr, at, count),
            ShiftEdit::ColDelete { at, count } => shift_addr_col_delete(addr, at, count),
        }
    }

    /// True for row insert/delete, false for column insert/delete.
    pub fn is_row_edit(&self) -> bool {
        matches!(
            self,
            ShiftEdit::RowInsert { .. } | ShiftEdit::RowDelete { .. }
        )
    }

    /// First coordinate on the edit axis touched by the edit. Every
    /// cell with `row >= boundary` (row edits) / `col >= boundary`
    /// (col edits) shifts (insert) or shifts-or-dies (delete); cells
    /// strictly below the boundary are untouched.
    pub fn boundary(&self) -> u32 {
        match *self {
            ShiftEdit::RowInsert { at, .. }
            | ShiftEdit::RowDelete { at, .. }
            | ShiftEdit::ColInsert { at, .. }
            | ShiftEdit::ColDelete { at, .. } => at,
        }
    }

    /// Can the edit change any value INSIDE `range` (canonical form —
    /// unbounded axes carry the `0 / u32::MAX` sentinels)? Used by the
    /// hydrated retarget to decide whether an AST-unchanged formula's
    /// cached value can be kept: a range whose end coordinate reaches
    /// the edit boundary may observe cells that moved.
    pub fn touches_range(&self, range: &crate::range::CellRange) -> bool {
        if self.is_row_edit() {
            range.end.row >= self.boundary()
        } else {
            range.end.col >= self.boundary()
        }
    }
}
