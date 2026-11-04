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

/// 剪切移动的判环结果（#16）：目标公式与引用方都按全部写入之后的状态判断，排队时不再用旧图重判。
/// `targets[i]` 为真表示 `planned[i]` 是已确认不成环的公式；`passive[i]` 为真表示第 i 个引用方
/// 不成环、可作为被动改写越过锁定格（与插删行列一致），成环的引用方仍须可编辑。
#[derive(Default)]
pub(super) struct CutCycles {
    pub(super) targets: Vec<bool>,
    pub(super) passive: Vec<bool>,
}

pub(super) fn plan_cut_cycles(
    workbook: &Workbook,
    source: (usize, CellRange),
    target_sheet: usize,
    planned: &[paste_values::PlannedCell],
    dependents: &[(usize, CellAddress, String)],
) -> Result<CutCycles, &'static str> {
    // 与 loader 的排队顺序一致：先清空剪切源，再写目标，最后改写引用方；同址以后者为准。
    let mut writes: Vec<_> = source.1.iter().map(|addr| (source.0, addr, None)).collect();
    let mut target_writes = Vec::new();
    for (index, (addr, value, _)) in planned.iter().enumerate() {
        let source = match value {
            Some(ClipboardValue::Formula { source, .. }) => Some(source.as_str()),
            Some(ClipboardValue::Literal(_)) => None,
            None => continue,
        };
        target_writes.push((index, writes.len()));
        writes.push((target_sheet, *addr, source));
    }
    let first_dependent = writes.len();
    writes.extend(dependents.iter().map(|(sheet, addr, text)| (*sheet, *addr, Some(text.as_str()))));
    let cyclic = workbook.formula_writes_close_cycles(&writes);
    let mut targets = vec![false; planned.len()];
    for (index, write) in target_writes {
        targets[index] = writes[write].2.is_some() && !cyclic[write];
    }
    let mut passive = Vec::with_capacity(dependents.len());
    for ((sheet, addr, _), cyclic) in dependents.iter().zip(&cyclic[first_dependent..]) {
        if *cyclic { workbook.ensure_range_editable(*sheet, CellRange::single(*addr))?; }
        passive.push(!cyclic);
    }
    Ok(CutCycles { targets, passive })
}
