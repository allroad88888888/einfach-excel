//! 按工作表作用域重写结构引用；被删的引用只变为错误节点，不吞掉 IFERROR 等外层表达式。
//! 局部（带内）插删复用同一套地址规则，只多一道正交轴覆盖判断。
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

pub(crate) fn shift_range(
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
    rewrite_scoped(expr, target, local, edit, None)
}

/// 只在指定列带插入一行；复用整行插入的地址规则，不把旁边的引用一起下移。
/// 宽于列带的矩形引用保持原范围，不能把单个角下移成另一块不等价的矩形。
pub(crate) fn rewrite_row_band_insert(
    expr: &mut Expr, target: &str, local: bool, row: u32, columns: (u32, u32),
) -> bool {
    rewrite_scoped(expr, target, local, ShiftEdit::RowInsert { at: row, count: 1 }, Some(columns))
}

/// 插入/删除单元格（局部位移）：`band` 是正交轴上的带（行编辑为列带，列编辑为行带）。
/// 只有正交跨度完全落在带内的引用才随位移；部分重叠的矩形保持原样，与 Excel 一致。
pub(crate) fn rewrite_band_shift(
    expr: &mut Expr, target: &str, local: bool, edit: ShiftEdit, band: (u32, u32),
) -> bool {
    rewrite_scoped(expr, target, local, edit, Some(band))
}

fn rewrite_scoped(
    expr: &mut Expr, target: &str, local: bool, edit: ShiftEdit, band: Option<(u32, u32)>,
) -> bool {
    match expr {
        Expr::CellRef(..)
        | Expr::SheetRef { .. }
        | Expr::Sheet3DRef { .. }
        | Expr::Range { .. }
        | Expr::SheetRange { .. }
        | Expr::Sheet3DRange { .. } => {
            if let Some((first, last)) = band {
                let rows = !edit.is_row_edit();
                let covered = match expr {
                    Expr::CellRef(addr, _)
                    | Expr::SheetRef { addr, .. }
                    | Expr::Sheet3DRef { addr, .. } =>
                        (first..=last).contains(if rows { &addr.row } else { &addr.col }),
                    Expr::Range { start, end, unbounded, .. }
                    | Expr::SheetRange { start, end, unbounded, .. }
                    | Expr::Sheet3DRange { start, end, unbounded, .. } => {
                        let (a, b, open) = if rows {
                            (start.row, end.row, unbounded.rows_unbounded())
                        } else {
                            (start.col, end.col, unbounded.cols_unbounded())
                        };
                        !open && first <= a.min(b) && a.max(b) <= last
                    }
                    _ => unreachable!(),
                };
                if !covered { return false; }
            }
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
                Expr::Sheet3DRef {
                    start_sheet,
                    end_sheet,
                    addr,
                    ..
                } if start_sheet.eq_ignore_ascii_case(target)
                    || end_sheet.eq_ignore_ascii_case(target) =>
                {
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
                Expr::Sheet3DRange {
                    start_sheet,
                    end_sheet,
                    start,
                    end,
                    unbounded,
                    ..
                } if start_sheet.eq_ignore_ascii_case(target)
                    || end_sheet.eq_ignore_ascii_case(target) =>
                {
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
            let changed = rewrite_scoped(inner, target, local, edit, band);
            // #REF! 不是合法的 spill 锚点，不能回写成不可重解析的 #REF!#。
            if changed && matches!(inner.as_ref(), Expr::Error(_)) {
                *expr = (**inner).clone();
            }
            changed
        }
        Expr::Negate(inner) | Expr::Percent(inner) => {
            rewrite_scoped(inner, target, local, edit, band)
        }
        Expr::BinOp { left, right, .. }
        | Expr::DynamicRange {
            start: left,
            end: right,
        } => {
            rewrite_scoped(left, target, local, edit, band)
                | rewrite_scoped(right, target, local, edit, band)
        }
        Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
            let mut changed = false;
            for arg in args {
                changed |= rewrite_scoped(arg, target, local, edit, band);
            }
            changed
        }
        Expr::Call(callee, args) => {
            let mut changed = rewrite_scoped(callee, target, local, edit, band);
            for arg in args {
                changed |= rewrite_scoped(arg, target, local, edit, band);
            }
            changed
        }
        _ => false,
    }
}
