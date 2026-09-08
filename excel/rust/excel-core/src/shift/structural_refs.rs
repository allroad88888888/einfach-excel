//! 按工作表作用域重写结构引用；被删的引用只变为错误节点，不吞掉 IFERROR 等外层表达式。
use super::ShiftEdit;
use crate::formula::{Expr, RangeBounds};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::CellAddress;
use einfach_core::ValueError;

fn axis(edit: ShiftEdit) -> (u32, u32, bool) {
    match edit {
        ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
            (at, count, true)
        }
        ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
            (at, count, false)
        }
    }
}

fn shift_index(value: u32, edit: ShiftEdit) -> Option<u32> {
    let (at, count, insert) = axis(edit);
    let limit = if edit.is_row_edit() {
        EXCEL_MAX_ROWS
    } else {
        EXCEL_MAX_COLS
    };
    if value >= limit {
        return None;
    }
    let next = if value < at || count == 0 {
        value
    } else if insert {
        value.checked_add(count)?
    } else if value < at.checked_add(count)? {
        return None;
    } else {
        value - count
    };
    (next < limit).then_some(next)
}

fn shift_cell(mut addr: CellAddress, edit: ShiftEdit) -> Option<CellAddress> {
    if edit.is_row_edit() {
        addr.row = shift_index(addr.row, edit)?;
    } else {
        addr.col = shift_index(addr.col, edit)?;
    }
    Some(addr)
}

/// 删除只缩小相交区间；只有范围被完全删光时才产生 #REF!。保留用户书写的角顺序。
fn shift_interval(start: u32, end: u32, edit: ShiftEdit) -> Option<(u32, u32)> {
    let (at, count, insert) = axis(edit);
    if insert || count == 0 {
        return Some((shift_index(start, edit)?, shift_index(end, edit)?));
    }
    let after = at.checked_add(count)?;
    let (low, high) = (start.min(end), start.max(end));
    let first = if low >= at && low < after { after } else { low };
    let last = if high >= at && high < after {
        at.checked_sub(1)?
    } else {
        high
    };
    if first > last {
        return None;
    }
    let (first, last) = (shift_index(first, edit)?, shift_index(last, edit)?);
    Some(if start <= end {
        (first, last)
    } else {
        (last, first)
    })
}

fn shift_range(
    start: &mut CellAddress,
    end: &mut CellAddress,
    unbounded: RangeBounds,
    edit: ShiftEdit,
) -> bool {
    let indices = if edit.is_row_edit() {
        if unbounded.rows_unbounded() {
            return true;
        }
        shift_interval(start.row, end.row, edit)
    } else {
        if unbounded.cols_unbounded() {
            return true;
        }
        shift_interval(start.col, end.col, edit)
    };
    let Some((first, last)) = indices else {
        return false;
    };
    if edit.is_row_edit() {
        start.row = first;
        end.row = last;
    } else {
        start.col = first;
        end.col = last;
    }
    true
}

/// 返回是否有实际改写。`local` 只在公式所属表就是被编辑表时为 true。
pub(crate) fn rewrite_structural_refs(
    expr: &mut Expr,
    target: &str,
    local: bool,
    edit: ShiftEdit,
) -> bool {
    match expr {
        Expr::CellRef(..)
        | Expr::SheetRef { .. }
        | Expr::Range { .. }
        | Expr::SheetRange { .. } => {
            let old = expr.clone();
            let valid = match expr {
                Expr::CellRef(addr, _) if local => {
                    if let Some(next) = shift_cell(*addr, edit) {
                        *addr = next;
                        true
                    } else {
                        false
                    }
                }
                Expr::SheetRef { sheet, addr, .. } if sheet.eq_ignore_ascii_case(target) => {
                    if let Some(next) = shift_cell(*addr, edit) {
                        *addr = next;
                        true
                    } else {
                        false
                    }
                }
                Expr::Range {
                    start,
                    end,
                    unbounded,
                    ..
                } if local => shift_range(start, end, *unbounded, edit),
                Expr::SheetRange {
                    sheet,
                    start,
                    end,
                    unbounded,
                    ..
                } if sheet.eq_ignore_ascii_case(target) => {
                    shift_range(start, end, *unbounded, edit)
                }
                _ => true,
            };
            if !valid {
                *expr = Expr::Error(ValueError::InvalidRef);
            }
            *expr != old
        }
        Expr::SpillRef(inner) => {
            let changed = rewrite_structural_refs(inner, target, local, edit);
            // #REF! 不是合法的 spill 锚点，不能回写成不可重解析的 #REF!#。
            if changed && matches!(inner.as_ref(), Expr::Error(_)) {
                *expr = (**inner).clone();
            }
            changed
        }
        Expr::Negate(inner) | Expr::Percent(inner) => {
            rewrite_structural_refs(inner, target, local, edit)
        }
        Expr::BinOp { left, right, .. }
        | Expr::DynamicRange {
            start: left,
            end: right,
        } => {
            rewrite_structural_refs(left, target, local, edit)
                | rewrite_structural_refs(right, target, local, edit)
        }
        Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
            let mut changed = false;
            for arg in args {
                changed |= rewrite_structural_refs(arg, target, local, edit);
            }
            changed
        }
        Expr::Call(callee, args) => {
            let mut changed = rewrite_structural_refs(callee, target, local, edit);
            for arg in args {
                changed |= rewrite_structural_refs(arg, target, local, edit);
            }
            changed
        }
        _ => false,
    }
}
