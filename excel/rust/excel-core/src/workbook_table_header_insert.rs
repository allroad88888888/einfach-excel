//! 表头无空位时，只下移 Table 列带的稀疏单元格；前后像复用 Table 历史。
use super::*;
use crate::shift::rewrite_row_band_insert;

pub(super) fn prepare(
    workbook: &Workbook, sheet: usize, before: TableEntry, row_count: u32,
) -> Result<TableDefinitionChange, String> {
    let row = before.range.start.row;
    let columns = (before.range.start.col, before.range.end.col);
    let range = CellRange::new(before.range.start, CellAddress::new(GRID_MAX_ROW, columns.1));
    validate_cells(workbook, sheet, range)?;
    let target = &workbook.sheets[sheet];
    if before.range.end.row + 1 >= row_count {
        return Err("The header insertion would move the table outside this worksheet.".into());
    }
    // 交叉元数据位移尚未接完时，先在任何写入前拒绝，不能静默留下旧坐标。
    if workbook.tables.values().any(|table| table.name() != before.name()
        && table.sheet_name() == before.sheet_name() && table.range().intersects(range))
        || target.data_validations().iter().any(|entry| entry.range.intersects(range))
        || workbook.conditional_formats[sheet].rules.iter().any(|entry|
            CellRange::new(CellAddress::new(entry.row_start, entry.col_start),
                CellAddress::new(entry.row_end, entry.col_end)).intersects(range))
        || target.filter().is_some_and(|filter| filter.range().is_none_or(|bounds| bounds.intersects(range)))
        || workbook.named_values.values().any(|entry| matches!(entry.definition,
            NamedDefinition::Range { sheet_key, range: Some(bounds) }
                if Some(sheet_key) == workbook.sheet_key(sheet) && bounds.intersects(range))) {
        return Err("Header insertion across tables, ranges or rules is not supported yet.".into());
    }
    let original = HistorySnapshot::capture(target, range, true);
    if original.cells.as_ref().unwrap().iter().any(|cell| cell.addr.row + 1 >= row_count)
        || original.formats.cell_styles.iter().any(|(addr, _)| addr.row + 1 >= row_count) {
        return Err("The header insertion would move cells outside this worksheet.".into());
    }
    // 只保存实际稀疏条目，不遍历百万行，也不把行高／列宽搬进 cellStyle。
    if original.retained_bytes() > MAX_BYTES / 2 {
        return Err("Changing table headers exceeds the 32 MiB undo budget.".into());
    }
    let mut after = before.clone();
    after.has_headers = true;
    after.range.end.row += 1;
    let rewrite = |owner: usize, expr: &mut Expr| {
        rewrite_row_band_insert(expr, before.sheet_name(), owner == sheet, row, columns)
    };
    let mut next = original.clone();
    for cell in next.cells.as_mut().unwrap() {
        if let Some(source) = &cell.formula {
            if let Some(mut expr) = parse_formula(source) {
                if rewrite(sheet, &mut expr) { cell.formula = Some(crate::render_formula(&expr)); }
            }
        }
        cell.addr.row += 1;
    }
    next.cells.as_mut().unwrap().extend(after.columns.iter().enumerate().map(|(offset, name)|
        CellSnapshot::value(CellAddress::new(row, columns.0 + offset as u32), Value::Text(name.clone()))));
    next.cells.as_mut().unwrap().sort_by_key(|cell| (cell.addr.row, cell.addr.col));
    for (addr, _) in &mut next.formats.cell_styles { addr.row += 1; }
    let mut formulas = FormulaSourceChange::prepare(workbook, &|owner, bounds, template, expr| {
        (template.is_some() || owner != sheet || !range.intersects(bounds)) && rewrite(owner, expr)
    });
    FormulaSourceChange::fold_table(&mut formulas, &before, Some(&mut after));
    // 标准公式的引用与原点同时随单元格移动，否则随后扩表会多偏移一行。
    for formula in after.calculated_columns.iter_mut().flatten() {
        if formula.row() >= row {
            *formula = crate::TableColumnFormula::new(formula.row() + 1, formula.formula())?;
        }
    }
    let rules = FormulaRuleChange::prepare(workbook, &|owner, _, expr| rewrite(owner, expr));
    let lambdas = FormulaLambdaChange::prepare(workbook, &|expr|
        rewrite_row_band_insert(expr, before.sheet_name(), false, row, columns));
    let change = TableDefinitionChange { sheet, range: after.range, before, after: Some(after),
        cells: vec![(original, next)], formulas, rules, lambdas, filter: None };
    if change.retained_bytes() > MAX_BYTES {
        return Err("Changing table headers exceeds the 32 MiB undo budget.".into());
    }
    Ok(change)
}
