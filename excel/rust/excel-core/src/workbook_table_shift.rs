//! Table 定义随行列插删移动；计算列按原工作表列身份保留，不依赖当前格值。
use super::*;
use crate::shift::{rewrite_structural_refs, ShiftEdit};
use crate::TableColumnFormula;

impl Workbook {
    pub(crate) fn remap_tables_after_shift(&mut self, sheet: usize, edit: ShiftEdit) {
        let Some(name) = self.names.get(sheet).cloned() else { return; };
        let keys: Vec<_> = self.tables.iter().filter(|(_, table)| table.sheet_name == name)
            .map(|(key, _)| key.clone()).collect();
        let mut geometry_changed = false;
        let mut templates_changed = false;
        for key in keys {
            let before = &self.tables[&key];
            let (range, columns) = match remap_table_geometry(before.range, &before.columns, edit) {
                TableRemap::Keep => (before.range, before.columns.clone()),
                TableRemap::Resize { range, columns } => {
                    geometry_changed = true;
                    (range, columns)
                }
                TableRemap::Delete => {
                    self.tables.remove(&key);
                    geometry_changed = true;
                    continue;
                }
            };
            let formulas = shifted_columns(before, range, edit);
            templates_changed |= formulas != before.calculated_columns;
            let after = self.tables.get_mut(&key).unwrap();
            after.range = range;
            after.columns = columns;
            after.calculated_columns = formulas;
        }
        if geometry_changed {
            self.bump_tables_epoch();
        } else if templates_changed {
            // 表的几何未变，不让所有结构化引用额外重算。
            self.tables_epoch = self.tables_epoch.wrapping_add(1);
        }
    }
}

fn shifted_columns(table: &TableEntry, next_range: CellRange, edit: ShiftEdit)
    -> Vec<Option<TableColumnFormula>> {
    if table.calculated_columns.is_empty() { return Vec::new(); }
    let mut next = vec![None; next_range.cols() as usize];
    for (offset, formula) in table.calculated_columns.iter().enumerate() {
        let Some(formula) = formula else { continue; };
        let old_col = table.range.start.col + offset as u32;
        let col = if edit.is_row_edit() { old_col }
            else { edit.apply(CellAddress::new(0, old_col)).col };
        if col < next_range.start.col || col > next_range.end.col { continue; }
        let origin = surviving_origin(table, formula, edit);
        let source = formula.formula_at(origin).expect("validated template origin");
        let mut expr = parse_formula(&source).expect("validated column formula");
        // 与现有单元格结构位移共用 AST 规则，$ 引用也随真实行列插删移动。
        rewrite_structural_refs(&mut expr, table.sheet_name(), true, edit);
        let row = if edit.is_row_edit() { edit.apply(CellAddress::new(origin, old_col)).row }
            else { origin };
        next[(col - next_range.start.col) as usize] = Some(
            TableColumnFormula::new(row, &crate::render_formula(&expr))
                .expect("structural preflight keeps the template inside the worksheet"));
    }
    next
}

/// 原点行被删除时，先把标准公式移到仍存活的行，再做结构改写。
/// 不能直接改写被删行的 A3：那会把其它行仍有效的逐行公式误变成 #REF!。
fn surviving_origin(table: &TableEntry, formula: &TableColumnFormula, edit: ShiftEdit) -> u32 {
    let row = formula.row();
    if !edit.is_row_edit() || edit.apply(CellAddress::new(row, 0)).row < crate::sheet::EXCEL_MAX_ROWS {
        return row;
    }
    let first = table.range.start.row + u32::from(table.has_headers);
    let last = table.range.end.row.saturating_sub(u32::from(table.has_totals));
    if let ShiftEdit::RowDelete { at, count } = edit {
        let end = at + count;
        let mut candidates = Vec::with_capacity(2);
        if first <= last && first < at { candidates.push(last.min(at - 1)); }
        if first <= last && end <= last { candidates.push(first.max(end)); }
        // 数据区全删后仍保留标准公式，供以后新增记录使用。
        if candidates.is_empty() {
            if end < crate::sheet::EXCEL_MAX_ROWS { candidates.push(end); }
            candidates.push(at.saturating_sub(1));
        }
        // 选原点不能把本来有效的相对引用先移出画布、永久固化成 #REF!。
        // 复用复制算法做往返检查，不引入另一套引用遍历或求值。
        let expr = parse_formula(formula.formula()).expect("validated column formula");
        for candidate in &candidates {
            let delta = i64::from(*candidate) - i64::from(row);
            let roundtrip = crate::shift::shift_copy_formula(&expr, delta, 0)
                .and_then(|shifted| crate::shift::shift_copy_formula(&shifted, -delta, 0));
            if roundtrip.as_ref() == Ok(&expr) { return *candidate; }
        }
        return candidates[0];
    }
    // 缩表后留在范围外的原点可能被插行推越界，改用已通过几何预检的表内行。
    first.min(table.range.end.row)
}
