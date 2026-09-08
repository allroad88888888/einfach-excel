//! 剪切后的引用跟随：只重写实际引用了源区域的公式，不平移无关引用。

use super::*;
use crate::formula::Expr;

/// 当前 React 只有单表入口；同表移动仍需更新其他工作表对它的显式引用。
pub(super) fn rewrite(
    expr: &mut Expr,
    local_sheet: bool,
    sheet_name: &str,
    source: CellRange,
    target: CellAddress,
) -> Result<(), ClipboardError> {
    if source.start == target {
        return Ok(());
    }
    let map = |addr: &mut CellAddress| {
        if source.contains(*addr) {
            addr.row = target.row + addr.row - source.start.row;
            addr.col = target.col + addr.col - source.start.col;
        }
    };
    let map_range = |start: &mut CellAddress, end: &mut CellAddress| {
        // 部分切走中间单元格不能用“挪两个端点”冒充正确范围；暂明确拒绝。
        let range = CellRange::new(*start, *end).normalize();
        let overlaps = range.start.row <= source.end.row
            && range.end.row >= source.start.row
            && range.start.col <= source.end.col
            && range.end.col >= source.start.col;
        if overlaps && !(source.contains(*start) && source.contains(*end)) {
            return Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE");
        }
        map(start);
        map(end);
        Ok(())
    };
    match expr {
        Expr::CellRef(addr, _) if local_sheet => map(addr),
        Expr::SheetRef { sheet, addr, .. } if sheet.eq_ignore_ascii_case(sheet_name) => map(addr),
        Expr::Range { start, end, .. } if local_sheet => map_range(start, end)?,
        Expr::SheetRange {
            sheet, start, end, ..
        } if sheet.eq_ignore_ascii_case(sheet_name) => {
            map_range(start, end)?;
        }
        Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
            rewrite(inner, local_sheet, sheet_name, source, target)?;
        }
        Expr::BinOp { left, right, .. }
        | Expr::DynamicRange {
            start: left,
            end: right,
        } => {
            rewrite(left, local_sheet, sheet_name, source, target)?;
            rewrite(right, local_sheet, sheet_name, source, target)?;
        }
        Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
            for arg in args {
                rewrite(arg, local_sheet, sheet_name, source, target)?;
            }
        }
        Expr::Call(callee, args) => {
            rewrite(callee, local_sheet, sheet_name, source, target)?;
            for arg in args {
                rewrite(arg, local_sheet, sheet_name, source, target)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(super) fn dependent_writes(
    workbook: &Workbook,
    sheet_idx: usize,
    source: CellRange,
    target: CellRange,
) -> Result<Vec<(usize, CellAddress, String)>, ClipboardError> {
    let mut writes = Vec::new();
    let whole_grid = CellRange::new(
        CellAddress::new(0, 0),
        CellAddress::new(
            crate::sheet::EXCEL_MAX_ROWS - 1,
            crate::sheet::EXCEL_MAX_COLS - 1,
        ),
    );
    let sheet_name = workbook.name(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
    for index in 0..workbook.sheet_count() {
        let sheet = workbook.sheet(index).ok_or("CLIPBOARD_INVALID_SHEET")?;
        // 稀疏公式索引，绝不逐格扫整个工作表。
        for addr in sheet.formula_addrs_in_range(whole_grid) {
            if index == sheet_idx && (source.contains(addr) || target.contains(addr)) {
                continue;
            }
            let text = sheet
                .formula_text_at(addr)
                .ok_or("CLIPBOARD_INVALID_FORMULA")?;
            let mut expr = crate::parse_formula(&text).ok_or("CLIPBOARD_INVALID_FORMULA")?;
            let original = expr.clone();
            rewrite(
                &mut expr,
                index == sheet_idx,
                sheet_name,
                source,
                target.start,
            )?;
            if expr != original {
                writes.push((index, addr, crate::render_formula(&expr)));
            }
        }
    }
    Ok(writes)
}
