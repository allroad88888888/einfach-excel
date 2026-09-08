//! 复制/填充的相对引用平移；两种操作共用绝对引用与越界规则。

use crate::formula::{Expr, RangeAbs, RangeBounds, RefAbs};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::CellAddress;

fn shift_axis(value: u32, delta: i64, absolute: bool, max: u32) -> Option<u32> {
    if absolute {
        return Some(value);
    }
    let shifted = value as i64 + delta;
    (shifted >= 0 && shifted < max as i64).then_some(shifted as u32)
}

fn shift_ref(addr: CellAddress, abs: RefAbs, drow: i64, dcol: i64) -> Option<CellAddress> {
    Some(CellAddress::new(
        shift_axis(addr.row, drow, abs.row, EXCEL_MAX_ROWS)?,
        shift_axis(addr.col, dcol, abs.col, EXCEL_MAX_COLS)?,
    ))
}

fn shift_range(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
    abs: RangeAbs,
    drow: i64,
    dcol: i64,
) -> Option<(CellAddress, CellAddress)> {
    let shift_corner = |addr: CellAddress, corner_abs: RefAbs, end_corner: bool| {
        let row = if unbounded.rows_unbounded() {
            if end_corner {
                u32::MAX
            } else {
                0
            }
        } else {
            shift_axis(addr.row, drow, corner_abs.row, EXCEL_MAX_ROWS)?
        };
        let col = if unbounded.cols_unbounded() {
            if end_corner {
                u32::MAX
            } else {
                0
            }
        } else {
            shift_axis(addr.col, dcol, corner_abs.col, EXCEL_MAX_COLS)?
        };
        Some(CellAddress::new(row, col))
    };
    Some((
        shift_corner(start, abs.start, false)?,
        shift_corner(end, abs.end, true)?,
    ))
}

pub fn shift_copy_formula(expr: &Expr, drow: i64, dcol: i64) -> Result<Expr, ()> {
    let shifted = match expr {
        // `Expr::Omitted` 必须显式列出：这个 match 的兜底是 `UnsupportedFormula`，
        // 漏了它就会让 `=SUM(A1,,B1)` 拖拽填充直接失败，而不是原样平移。
        Expr::Omitted
        | Expr::Number(_)
        | Expr::Text(_)
        | Expr::Bool(_)
        | Expr::Error(_)
        | Expr::Name(_) => expr.clone(),
        Expr::CellRef(addr, abs) => shift_ref(*addr, *abs, drow, dcol)
            .map(|addr| Expr::CellRef(addr, *abs))
            .unwrap_or_else(|| Expr::Error(einfach_core::ValueError::InvalidRef)),
        Expr::Range {
            start,
            end,
            unbounded,
            abs,
        } => shift_range(*start, *end, *unbounded, *abs, drow, dcol)
            .map(|(start, end)| Expr::Range {
                start,
                end,
                unbounded: *unbounded,
                abs: *abs,
            })
            .unwrap_or_else(|| Expr::Error(einfach_core::ValueError::InvalidRef)),
        Expr::SheetRef { sheet, addr, abs } => shift_ref(*addr, *abs, drow, dcol)
            .map(|addr| Expr::SheetRef {
                sheet: sheet.clone(),
                addr,
                abs: *abs,
            })
            .unwrap_or_else(|| Expr::Error(einfach_core::ValueError::InvalidRef)),
        Expr::SheetRange {
            sheet,
            start,
            end,
            unbounded,
            abs,
        } => shift_range(*start, *end, *unbounded, *abs, drow, dcol)
            .map(|(start, end)| Expr::SheetRange {
                sheet: sheet.clone(),
                start,
                end,
                unbounded: *unbounded,
                abs: *abs,
            })
            .unwrap_or_else(|| Expr::Error(einfach_core::ValueError::InvalidRef)),
        Expr::Negate(inner) => Expr::Negate(Box::new(shift_copy_formula(inner, drow, dcol)?)),
        Expr::Percent(inner) => Expr::Percent(Box::new(shift_copy_formula(inner, drow, dcol)?)),
        Expr::BinOp { op, left, right } => Expr::BinOp {
            op: *op,
            left: Box::new(shift_copy_formula(left, drow, dcol)?),
            right: Box::new(shift_copy_formula(right, drow, dcol)?),
        },
        Expr::FuncCall { name, args } => Expr::FuncCall {
            name: name.clone(),
            args: args
                .iter()
                .map(|arg| shift_copy_formula(arg, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        },
        Expr::SpillRef(anchor) => Expr::SpillRef(Box::new(shift_copy_formula(anchor, drow, dcol)?)),
        Expr::DynamicRange { start, end } => Expr::DynamicRange {
            start: Box::new(shift_copy_formula(start, drow, dcol)?),
            end: Box::new(shift_copy_formula(end, drow, dcol)?),
        },
        Expr::Call(callee, args) => Expr::Call(
            Box::new(shift_copy_formula(callee, drow, dcol)?),
            args.iter()
                .map(|arg| shift_copy_formula(arg, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        Expr::ArrayLit { .. } => expr.clone(),
        Expr::MultiArea(parts) => Expr::MultiArea(
            parts
                .iter()
                .map(|part| shift_copy_formula(part, drow, dcol))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        _ => return Err(()),
    };
    Ok(shifted)
}
