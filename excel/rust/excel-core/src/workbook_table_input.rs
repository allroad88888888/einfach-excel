//! 单格输入触发的 Table 扩展；复用输入校验与局部历史，不复制数据区。
use super::*;
use crate::cell_input::{parse_formatted_input, CellInput};
use crate::CellSnapshot;

impl TableDefinitionChange {
    pub(crate) fn prepare_input_expansion(
        workbook: &Workbook,
        sheet: usize,
        addr: CellAddress,
        input: &str,
    ) -> Result<Option<Self>, String> {
        if input.is_empty() {
            return Ok(None);
        }
        let sheet_name = workbook.name(sheet).ok_or("INVALID_SHEET")?;
        let tables = workbook.list_tables();
        // 已属于某张表的格子不能被相邻 Table 抢走，包括另一张表的表头。
        if tables
            .iter()
            .any(|table| table.sheet_name() == sheet_name && table.range().contains(addr))
        {
            return Ok(None);
        }
        let mut candidates = tables.iter().filter(|table| {
            if table.sheet_name() != sheet_name {
                return false;
            }
            let range = table.range();
            let below = !table.has_totals()
                && addr.row == range.end.row + 1
                && (range.start.col..=range.end.col).contains(&addr.col);
            let right = addr.col == range.end.col + 1
                && (range.start.row..=range.end.row).contains(&addr.row);
            below || right
        });
        let Some(table) = candidates.next() else {
            return Ok(None);
        };
        // 两张表都邻接时不猜归属，普通输入后由用户明确调整 Table 范围。
        if candidates.next().is_some() {
            return Ok(None);
        }
        let range = CellRange::new(
            table.range().start,
            CellAddress::new(
                table.range().end.row.max(addr.row),
                table.range().end.col.max(addr.col),
            ),
        );
        // 自动扩展不能阻止原本合法的普通输入；障碍留给显式 Resize 提示处理。
        if validate_cells(workbook, sheet, range).is_err()
            || tables.iter().any(|other| {
                other.name() != table.name()
                    && other.sheet_name() == sheet_name
                    && other.range().intersects(range)
            })
        {
            return Ok(None);
        }
        let mut change = Self::prepare_resize(workbook, table.name(), range)?
            .ok_or("The table did not expand.")?;
        if table.has_headers() && addr.row == table.range().start.row {
            // 在新表头输入时名称就是文字；与创建 Table 一样规范化重复/空名称。
            let used: HashSet<_> = table
                .columns()
                .iter()
                .map(|name| name.to_ascii_uppercase())
                .collect();
            let raw = input.strip_prefix('\'').unwrap_or(input).trim();
            let name = if raw.is_empty() || used.contains(&raw.to_ascii_uppercase()) {
                next_auto_column_name(&used)
            } else {
                raw.to_owned()
            };
            let after = change.after.as_mut().unwrap();
            *after.columns.last_mut().unwrap() = name.clone();
            let (_, header) = change
                .cells
                .iter_mut()
                .find(|(_, next)| next.range.contains(addr))
                .unwrap();
            header.cells = Some(vec![CellSnapshot::value(addr, Value::Text(name))]);
        }
        Ok(Some(change))
    }

    pub(crate) fn apply_expanding_input(
        &mut self,
        workbook: &mut Workbook,
        addr: CellAddress,
        input: &str,
    ) -> Result<(), String> {
        if self.before.has_headers && addr.row == self.before.range.start.row {
            return self.apply(workbook, false).map_err(str::to_string);
        }
        let mut calculated = if addr.col > self.before.range.end.col {
            Self::prepare_calculated_column(workbook, self.sheet, addr, input,
                self.after.as_ref().expect("input expands a table"))?
        } else { None };
        let inherited_row = addr.row > self.before.range.end.row
            && self.before.calculated_columns.iter().any(Option::is_some);
        // 输入公式可能依赖同一新行里稍后继承的计算列，必须等整行写完再验证。
        let deferred_formula = if inherited_row {
            match parse_formatted_input(input, true,
                &workbook.sheets[self.sheet].get_format(&addr.to_string()).number_format) {
                CellInput::Formula(source) => Some(source),
                _ => None,
            }
        } else { None };
        let input_range = if let Some(calculated) = &calculated { calculated.range } else if inherited_row {
            CellRange::new(CellAddress::new(addr.row, self.before.range.start.col),
                CellAddress::new(addr.row, self.before.range.end.col))
        } else { CellRange::single(addr) };
        // 整列计划已有前后像，不能再复制一份同范围历史。
        let before = calculated.is_none().then(||
            HistorySnapshot::capture(&workbook.sheets[self.sheet], input_range, true));
        let mut roots = workbook.atom_context.table_dependent_atoms();
        roots.extend(workbook.sheets[self.sheet].store_root_atoms_for_addr(addr));
        let dependents = workbook.store.reverse_dependents(&roots);
        let mut arrays = workbook.array_dependents_for_atoms(&roots);
        arrays.extend(workbook.array_dependents_for_atoms(&dependents));
        if inherited_row || calculated.is_some() {
            arrays.extend(workbook.array_dependents_for_range(self.sheet, input_range));
        }
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = self.apply(workbook, false).map_err(str::to_string);
            if result.is_err() {
                return;
            }
            result = if let Some(calculated) = &mut calculated {
                calculated.apply_calculated_input(workbook).map(|_| ())
            } else if let Some(source) = &deferred_formula {
                workbook.set_table_formula(self.sheet, addr, source).map_err(str::to_string)
            } else {
                workbook.set_cell_input(self.sheet, &addr.to_string(), input).map_err(str::to_string)
            };
            // Table 数据格不能成为 spill 锚点，失败必须还原输入与表定义。
            if result.is_ok()
                && calculated.is_none()
                && workbook.sheets[self.sheet]
                    .spill_intersecting(CellRange::single(addr))
                    .is_some()
            {
                result = Err("Spilled arrays cannot be entered inside a table.".into());
            }
            let mut changed = vec![addr];
            if result.is_ok() && inherited_row {
                result = self.before.calculated_columns.iter().enumerate().try_for_each(|(offset, formula)| {
                    let Some(formula) = formula else { return Ok(()); };
                    let target = CellAddress::new(addr.row, self.before.range.start.col + offset as u32);
                    // 手工输入优先；扩进范围的已有数据同样保留，不把它当空格覆盖。
                    if target == addr || workbook.sheets[self.sheet].formula_text_at(target).is_some()
                        || workbook.sheets[self.sheet].peek_value(target) != Value::Null {
                        return Ok(());
                    }
                    workbook.set_table_formula(self.sheet, target, &formula.formula_at(addr.row)?)?;
                    changed.push(target);
                    Ok(())
                }).map_err(str::to_string);
                if result.is_ok() {
                    result = changed.iter().try_for_each(|target| {
                        let value = crate::sheet::collapse_array_for_eval(
                            workbook.sheets[self.sheet].peek_value(*target));
                        workbook.validate_input_value(self.sheet, *target, &value)
                    }).map_err(str::to_string);
                }
            }
            if result.is_err() {
                if let Some(before) = &before {
                    before.restore(workbook, self.sheet).expect("input keeps its worksheet");
                }
                self.apply(workbook, true)
                    .expect("input rollback keeps the prepared table cells");
            } else {
                if let Some(calculated) = &mut calculated {
                    // 扩列的表头/几何与计算列共用同一条 Table 历史，不嵌套 push。
                    self.after = calculated.after.take();
                    self.cells.append(&mut calculated.cells);
                } else if let Some(before) = before {
                    let after = HistorySnapshot::capture(&workbook.sheets[self.sheet], before.range, true);
                    self.cells.push((before, after));
                }
                if self.retained_bytes() > crate::workbook_history::MAX_BYTES {
                    self.apply(workbook, true).expect("expanded input rollback keeps its snapshots");
                    result = Err("Expanding this table exceeds the 32 MiB undo budget.".into());
                }
            }
        });
        // 嵌套 batch 结束后重投既有数组，避免范围/输入先后次序泄露中间帧。
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}
