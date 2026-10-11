//! 表头腾位与追加数据行共用 Table 列带插行；只移动稀疏内容，前后像复用原历史。
use super::*;
use crate::shift::rewrite_row_band_insert;
use crate::{CellSnapshot, workbook_history::MAX_BYTES};

pub(super) enum InsertRow { Header, Data }

pub(super) fn prepare(
    workbook: &Workbook, sheet: usize, before: TableEntry, row_count: u32, kind: InsertRow,
) -> Result<TableDefinitionChange, String> {
    let header = matches!(kind, InsertRow::Header);
    let row = if header { before.range.start.row }
        else { before.range.end.row + 1 - u32::from(before.has_totals) };
    let columns = (before.range.start.col, before.range.end.col);
    let range = CellRange::new(CellAddress::new(row, columns.0), CellAddress::new(GRID_MAX_ROW, columns.1));
    let target = &workbook.sheets[sheet];
    // 只检查已安装的矩形（包含空值子格）；不能凭非空单元格判断是否切开数组。
    for anchor in target.spill_anchor_addr.values().copied() {
        let (rows, cols) = target.spill_info(anchor).unwrap_or((1, 1));
        let spilled = CellRange::new(anchor,
            CellAddress::new(anchor.row + rows.max(1) - 1, anchor.col + cols.max(1) - 1));
        if !spilled.intersects(range) { continue; }
        if !range.contains(spilled.start) || !range.contains(spilled.end)
            || spilled.intersects(before.range) {
            return Err("The table row insertion would split a spilled array or overlap the table.".into());
        }
        if spilled.end.row + 1 >= row_count {
            return Err("The table row insertion would move a spilled array outside this worksheet.".into());
        }
    }
    // 合并是不可拆的矩形；只允许整块位于移动列带内且不占用 Table 的合并格。
    for merged in target.merged_ranges().iter().filter(|merged| merged.intersects(range)) {
        if !range.contains(merged.start) || !range.contains(merged.end)
            || merged.intersects(before.range) {
            return Err("The table row insertion would split a merged cell or overlap the table.".into());
        }
        if merged.end.row + 1 >= row_count {
            return Err("The table row insertion would move a merged cell outside this worksheet.".into());
        }
    }
    if before.range.end.row + 1 >= row_count {
        return Err("The table row insertion would move the table outside this worksheet.".into());
    }
    let rules = FormulaRuleChange::prepare_row_band_insert(workbook, sheet, row, columns, row_count)?;
    let validations = ValidationShift::prepare(target.data_validations(), row, columns, row_count)?;
    let filter = match target.filter() {
        Some(before) => before.after_row_band_insert(row, columns, row_count)?
            .map(|after| (Some(before.clone()), Some(after))),
        None => None,
    };
    let mut shifted_tables = Vec::new();
    for table in workbook.tables.values().filter(|table| table.name() != before.name()
        && table.sheet_name() == before.sheet_name() && table.range().intersects(range)) {
        if table.range.start.col < columns.0 || table.range.end.col > columns.1 {
            return Err("The table row insertion would split another table's columns.".into());
        }
        if table.range.end.row + 1 >= row_count {
            return Err("The table row insertion would move another table outside this worksheet.".into());
        }
        let mut moved = table.clone();
        moved.range.start.row += 1;
        moved.range.end.row += 1;
        moved.shift_filter(crate::shift::ShiftEdit::RowInsert { at: row, count: 1 });
        shifted_tables.push((table.clone(), moved));
    }
    let named_ranges = workbook.named_ranges_for_row_band_insert(sheet, row, columns, row_count)?;
    // 腾位始终保存完整几何，即使当前没有合并／spill；移动后的标量公式也可能展开数组。
    // 恢复时先安装全部源码，再重投子格；不把计算结果当作待搬运的内容。
    let original = HistorySnapshot::capture_with_merges(target, range, true, true);
    if original.cells.as_ref().unwrap().iter().any(|cell| cell.addr.row + 1 >= row_count)
        || original.formats.cell_styles.iter().any(|(addr, _)| addr.row + 1 >= row_count) {
        return Err("The table row insertion would move cells outside this worksheet.".into());
    }
    // 只保存实际稀疏条目，不遍历百万行，也不把行高／列宽搬进 cellStyle。
    if original.retained_bytes() > MAX_BYTES / 2 {
        return Err("Inserting a table row exceeds the 32 MiB undo budget.".into());
    }
    let mut after = before.clone();
    after.has_headers |= header;
    after.range.end.row += 1;
    after.shift_filter(crate::shift::ShiftEdit::RowInsert { at: row, count: 1 });
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
    if header {
        next.cells.as_mut().unwrap().extend(after.columns.iter().enumerate().map(|(offset, name)|
            CellSnapshot::value(CellAddress::new(row, columns.0 + offset as u32), Value::Text(name.clone()))));
    }
    for (addr, _) in &mut next.formats.cell_styles { addr.row += 1; }
    for merged in next.merges.iter_mut().flatten() {
        merged.start.row += 1;
        merged.end.row += 1;
    }
    let mut formulas = FormulaSourceChange::prepare(workbook, &|owner, bounds, template, expr| {
        (template.is_some() || owner != sheet || !range.intersects(bounds)) && rewrite(owner, expr)
    });
    FormulaSourceChange::fold_table(&mut formulas, &before, Some(&mut after));
    // 标准公式的引用与原点同时随单元格移动，否则随后扩表会多偏移一行。
    for (old, moved) in &mut shifted_tables {
        FormulaSourceChange::fold_table(&mut formulas, old, Some(moved));
    }
    for table in std::iter::once(&mut after).chain(shifted_tables.iter_mut().map(|(_, moved)| moved)) {
        for formula in table.calculated_columns.iter_mut().flatten() {
            if formula.row() >= row {
                *formula = crate::TableColumnFormula::new(formula.row() + 1, formula.formula())?;
            }
        }
    }
    if !header {
        for (offset, formula) in after.calculated_columns.iter().enumerate() {
            if let Some(formula) = formula {
                next.cells.as_mut().unwrap().push(CellSnapshot::formula(
                    CellAddress::new(row, columns.0 + offset as u32), formula.formula_at(row)?));
            }
        }
    }
    next.cells.as_mut().unwrap().sort_by_key(|cell| (cell.addr.row, cell.addr.col));
    let lambdas = FormulaLambdaChange::prepare(workbook, &|expr|
        rewrite_row_band_insert(expr, before.sheet_name(), false, row, columns));
    let change = TableDefinitionChange { sheet, range: after.range, before, after: Some(after),
        cells: vec![(original, next)], formulas, rules, lambdas, named_ranges, shifted_tables, filter, validations };
    if change.retained_bytes() > MAX_BYTES {
        return Err("Inserting a table row exceeds the 32 MiB undo budget.".into());
    }
    Ok(change)
}
