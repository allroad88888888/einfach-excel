//! 相邻粘贴扩表：计划中的真实写入、表定义与继承公式共同进入原 Table 历史。
use super::*;
use crate::clipboard::{ClipboardValue, PlannedCell};
use crate::workbook_history::MAX_BYTES;

impl TableDefinitionChange {
    pub(crate) fn prepare_paste_expansion(
        workbook: &Workbook, sheet: usize, pasted: CellRange, planned: &mut Vec<PlannedCell>,
    ) -> Result<Option<Self>, &'static str> {
        let sheet_name = workbook.name(sheet).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let meaningful = |value: &Option<ClipboardValue>| {
            matches!(value, Some(value) if !matches!(value, ClipboardValue::Literal(Value::Null)))
        };
        let mut candidates = workbook.tables.values().filter_map(|table| {
            if table.sheet_name() != sheet_name { return None; }
            let old = table.range;
            // 向下粘贴只扩行，多出的列保持普通格；不会把汇总行当成数据覆盖后搬走。
            let below = !table.has_totals && pasted.start.row >= old.start.row + u32::from(table.has_headers)
                && pasted.start.row <= old.end.row + 1 && pasted.end.row > old.end.row
                && (old.start.col..=old.end.col).contains(&pasted.start.col);
            let right = pasted.start.row >= old.start.row && pasted.start.row <= old.end.row
                && pasted.end.row <= old.end.row && pasted.start.col >= old.start.col
                && pasted.start.col <= old.end.col + 1 && pasted.end.col > old.end.col;
            let activates = table.insert_row && planned.iter().any(|(addr, value, _)| {
                old.contains(*addr) && addr.row == old.start.row + u32::from(table.has_headers)
                    && meaningful(value)
            });
            let next = if below { CellRange::new(old.start, CellAddress::new(pasted.end.row, old.end.col)) }
                else if right { CellRange::new(old.start, CellAddress::new(old.end.row, pasted.end.col)) }
                else if activates { old }
                else { return None; };
            // 跳过空白/纯清空不能单凭目标矩形扩表。
            (activates || planned.iter().any(|(addr, value, _)| next.contains(*addr)
                && !old.contains(*addr) && meaningful(value))).then_some((table, next))
        });
        let Some((table, range)) = candidates.next() else { return Ok(None); };
        if candidates.next().is_some() || workbook.tables.values().any(|other| {
            other.name() != table.name() && other.sheet_name() == sheet_name
                && (other.range.intersects(range) || other.range.intersects(pasted))
        }) { return Ok(None); }
        // 与单格输入一致：不能安全自动扩表时仍允许原本合法的普通粘贴。
        let mut change = if range == table.range {
            validate_cells(workbook, sheet, range)?;
            Self { sheet, range, before: table.clone(), after: Some(table.clone().with_insert_row(false)),
                cells: Vec::new(), formulas: Vec::new(), rules: Vec::new(), lambdas: Vec::new(),
                filter: None, named_ranges: Vec::new(), shifted_tables: Vec::new(),
                validations: ValidationShift::default() }
        } else {
            let Some(change) = Self::prepare_resize(workbook, table.name(), range).ok().flatten()
                else { return Ok(None); };
            change
        };
        let after = change.after.as_mut().unwrap();
        let indices: std::collections::HashMap<_, _> = planned.iter().enumerate()
            .map(|(index, (addr, _, _))| (*addr, index)).collect();
        if after.insert_row && planned.iter().any(|(addr, value, _)| {
            range.contains(*addr) && addr.row == range.start.row + u32::from(after.has_headers)
                && meaningful(value)
        }) { after.insert_row = false; }
        let mut extra = Vec::new();
        if after.has_headers && range.end.col > table.range.end.col {
            let mut used: HashSet<_> = table.columns.iter().map(|name| name.to_ascii_uppercase()).collect();
            for col in table.range.end.col + 1..=range.end.col {
                let addr = CellAddress::new(range.start.row, col);
                let raw = match indices.get(&addr).map(|index| &planned[*index]) {
                    Some((_, Some(ClipboardValue::Formula { source, .. }), _)) => source.clone(),
                    Some((_, Some(ClipboardValue::Literal(Value::Text(value))), _)) => value.clone(),
                    Some((_, Some(ClipboardValue::Literal(Value::Null)), _)) => String::new(),
                    Some((_, Some(ClipboardValue::Literal(value)), _)) => crate::format::value_to_display(value),
                    _ => after.columns[(col - range.start.col) as usize].clone(),
                };
                let name = if raw.trim().is_empty() || used.contains(&raw.trim().to_ascii_uppercase()) {
                    next_auto_column_name(&used)
                } else { raw.trim().to_owned() };
                used.insert(name.to_ascii_uppercase());
                after.columns[(col - range.start.col) as usize] = name.clone();
                extra.push((addr, Some(ClipboardValue::Literal(Value::Text(name))), None));
            }
            // 新表头由同一个最终写入计划落地，不再由范围事务先写一次。
            change.cells.clear();
        }
        let first = if table.insert_row { range.start.row + u32::from(table.has_headers) }
            else { table.range.end.row + 1 };
        let end = range.end.row + 1 - u32::from(after.has_totals);
        let target = &workbook.sheets[sheet];
        let mut bytes = 0usize;
        if !after.insert_row {
            for row in first..end {
                for (offset, formula) in after.calculated_columns.iter().enumerate() {
                    let Some(formula) = formula else { continue; };
                    let addr = CellAddress::new(row, range.start.col + offset as u32);
                    // 显式粘贴（包含空白）和目标已有例外优先，模板只补真正未写入的空格。
                    if indices.contains_key(&addr) || target.has_formula_at(addr) || target.peek_value(addr) != Value::Null {
                        continue;
                    }
                    let source = formula.formula_at(row)?;
                    bytes += source.len() + 192;
                    if bytes > MAX_BYTES { return Err("Expanding this table exceeds the 32 MiB undo budget."); }
                    extra.push((addr, Some(ClipboardValue::Formula { source, evaluated: None }), None));
                }
            }
        }
        for cell in extra {
            if let Some(index) = indices.get(&cell.0) {
                planned[*index].1 = cell.1; // 保留复制源的格式，但列名必须是文字。
            } else { planned.push(cell); }
        }
        Ok(Some(change))
    }

    /// 回调只执行已预检的粘贴计划；原生事务负责定义发布、失败恢复及单条历史前后像。
    pub(crate) fn apply_expanding_paste(
        &mut self, workbook: &mut Workbook, range: CellRange,
        write: impl FnOnce(&mut Workbook) -> Result<(), &'static str>,
    ) -> Result<(), &'static str> {
        let before = HistorySnapshot::capture_with_merges(&workbook.sheets[self.sheet], range, true, true);
        if self.retained_bytes() + 2 * before.retained_bytes() > MAX_BYTES {
            return Err("Expanding this table exceeds the 32 MiB undo budget.");
        }
        let mut arrays = workbook.array_dependents_for_range(self.sheet, range);
        arrays.extend(workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms()));
        let observers: Vec<_> = workbook.sheets.iter_mut().map(Sheet::suspend_structure_notifications).collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = self.apply(workbook, false);
            if result.is_err() { return; }
            let rollback = HistorySnapshot::capture_with_merges(&workbook.sheets[self.sheet], range, true, true);
            result = write(workbook).and_then(|_| {
                validate_cells(workbook, self.sheet, self.after.as_ref().unwrap().range)
                    .map_err(|_| "Spilled arrays cannot be entered inside a table.")
            });
            if result.is_err() {
                rollback.restore(workbook, self.sheet).expect("paste keeps its worksheet");
                self.apply(workbook, true).expect("paste rollback retains its table definition");
                return;
            }
            self.range = range;
            self.cells = vec![(before, HistorySnapshot::capture_with_merges(
                &workbook.sheets[self.sheet], range, true, true))];
            if self.retained_bytes() > MAX_BYTES {
                self.apply(workbook, true).expect("paste rollback retains its final snapshots");
                result = Err("Expanding this table exceeds the 32 MiB undo budget.");
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}
