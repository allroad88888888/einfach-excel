//! 改表范围时把现有汇总内容移到新末行，不复制或清空数据区。
use super::*;

pub(super) fn prepare(
    workbook: &Workbook,
    sheet: usize,
    before: &TableEntry,
    after: &TableEntry,
    columns: &crate::shift::TableColumnEdit<'_>,
) -> Result<Vec<(HistorySnapshot, HistorySnapshot)>, String> {
    if !before.has_totals || before.range.end.row == after.range.end.row {
        return Ok(Vec::new());
    }
    let old_row = before.range.end.row;
    let new_row = after.range.end.row;
    let source = CellRange::new(
        CellAddress::new(old_row, before.range.start.col.max(after.range.start.col)),
        CellAddress::new(old_row, before.range.end.col.min(after.range.end.col)),
    );
    let destination = CellRange::new(
        CellAddress::new(new_row, after.range.start.col),
        CellAddress::new(new_row, after.range.end.col),
    );
    validate_cells(workbook, sheet, source)?;
    validate_cells(workbook, sheet, destination)?;
    let old_source = HistorySnapshot::capture(&workbook.sheets[sheet], source, true);
    let old_destination = HistorySnapshot::capture(&workbook.sheets[sheet], destination, true);
    if old_destination
        .cells
        .as_ref()
        .is_some_and(|cells| !cells.is_empty())
    {
        return Err("The new totals row contains data. Choose an empty totals row.".into());
    }
    let mut new_source = old_source.clone();
    new_source.cells = Some(Vec::new());
    let mut new_destination = old_destination.clone();
    let mut moved = old_source.cells.clone().unwrap_or_default();
    for cell in &mut moved {
        if let Some(formula) = &cell.formula {
            let mut expr = parse_formula(formula).ok_or("Cannot parse the totals formula.")?;
            // 搬移不是复制：保留自定义公式引用的原地址，结构化引用随新表范围求值。
            if columns.rewrite(&mut expr, Some((sheet, CellRange::single(cell.addr)))) {
                cell.formula = Some(crate::render_formula(&expr));
            }
        }
        cell.addr.row = new_row;
    }
    new_destination.cells = Some(moved);
    Ok(vec![
        (old_source, new_source),
        (old_destination, new_destination),
    ])
}
