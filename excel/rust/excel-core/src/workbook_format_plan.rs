//! 复用共边算法预检格式事务；临时地址集只描述前面区域可能物化的样式点。
use crate::{
    sheet::BorderPlan, CellAddress, CellBorders, CellRange, CellStyle, Sheet, StyleScope, Workbook,
};
use std::collections::HashSet;

pub(super) struct FormatBorderPlan {
    pub borders: BorderPlan,
    pub axis_borders: Vec<(CellRange, CellBorders)>,
}

pub(super) fn actual_range(range: CellRange, scope: StyleScope) -> CellRange {
    match scope {
        StyleScope::Cell => range,
        StyleScope::Row => CellRange::new(
            CellAddress::new(range.start.row, 0),
            CellAddress::new(range.end.row, 16_383),
        ),
        StyleScope::Column => CellRange::new(
            CellAddress::new(0, range.start.col),
            CellAddress::new(1_048_575, range.end.col),
        ),
    }
}

fn on_axis(addr: CellAddress, range: CellRange, scope: StyleScope) -> bool {
    match scope {
        StyleScope::Cell => false,
        StyleScope::Row => (range.start.row..=range.end.row).contains(&addr.row),
        StyleScope::Column => (range.start.col..=range.end.col).contains(&addr.col),
    }
}

pub(super) fn plan_borders(
    current: &Sheet,
    range: CellRange,
    scope: StyleScope,
    patch: &CellStyle,
    prior: &HashSet<CellAddress>,
) -> FormatBorderPlan {
    let mut result = FormatBorderPlan {
        borders: BorderPlan::new(),
        axis_borders: Vec::new(),
    };
    let Some(replacement) = &patch.borders else {
        return result;
    };
    let mut addresses: HashSet<_> = range.iter().collect();
    addresses.extend(
        current
            .cell_styles
            .keys()
            .chain(prior.iter())
            .copied()
            .filter(|addr| on_axis(*addr, range, scope)),
    );
    if scope != StyleScope::Cell && *replacement == CellBorders::default() {
        result.axis_borders = current.plan_axis_border_clear(range, scope, &mut addresses);
        // 前一区域可能新建邻格样式；清整轴时也必须覆盖其对应边段。
        for addr in prior {
            let (index, start, end) = if scope == StyleScope::Row {
                (addr.row, range.start.row, range.end.row)
            } else {
                (addr.col, range.start.col, range.end.col)
            };
            let edge = if index.checked_add(1) == Some(start) {
                Some(start)
            } else if end.checked_add(1) == Some(index) {
                Some(end)
            } else {
                None
            };
            if let Some(edge) = edge {
                addresses.insert(if scope == StyleScope::Row {
                    CellAddress::new(edge, addr.col)
                } else {
                    CellAddress::new(addr.row, edge)
                });
            }
        }
    }
    result.borders = current.plan_replacement_borders(
        addresses
            .into_iter()
            .map(|addr| (addr, replacement.clone())),
        current.merged_ranges(),
    );
    result
}

pub(super) fn ensure_plan_editable(
    workbook: &Workbook,
    sheet: usize,
    plan: &FormatBorderPlan,
) -> Result<(), &'static str> {
    for (range, _) in &plan.axis_borders {
        workbook.ensure_range_editable(sheet, *range)?;
    }
    for addr in plan.borders.keys() {
        workbook.ensure_range_editable(sheet, CellRange::single(*addr))?;
    }
    Ok(())
}

pub(super) fn preflight_selection(
    workbook: &Workbook,
    sheet: usize,
    targets: &[(CellRange, StyleScope)],
    patch: &CellStyle,
) -> Result<(), &'static str> {
    let current = workbook.sheet(sheet).ok_or("INVALID_SHEET")?;
    let mut prior = HashSet::new();
    let mut rows = HashSet::new();
    let mut columns = HashSet::new();
    for &(range, scope) in targets {
        workbook.ensure_range_editable(sheet, actual_range(range, scope))?;
        if patch.borders.is_none() {
            continue;
        }
        let plan = plan_borders(current, range, scope, patch, &prior);
        ensure_plan_editable(workbook, sheet, &plan)?;
        prior.extend(plan.borders.keys().copied());
        // 后续轴 patch 会扫描这些新样式。只收实际交叉点，不包围稀疏区域。
        match scope {
            StyleScope::Cell => prior.extend(range.iter()),
            StyleScope::Row => {
                for row in range.start.row..=range.end.row {
                    prior.extend(
                        current
                            .column_styles
                            .keys()
                            .chain(columns.iter())
                            .map(|col| CellAddress::new(row, *col)),
                    );
                    rows.insert(row);
                }
            }
            StyleScope::Column => {
                for col in range.start.col..=range.end.col {
                    prior.extend(
                        current
                            .row_styles
                            .keys()
                            .chain(rows.iter())
                            .map(|row| CellAddress::new(*row, col)),
                    );
                    columns.insert(col);
                }
            }
        }
    }
    Ok(())
}
