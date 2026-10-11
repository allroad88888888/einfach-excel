//! 单格输入触发的 Table 扩展；复用输入校验与局部历史，不复制数据区。
use super::*;
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
        let before =
            HistorySnapshot::capture(&workbook.sheets[self.sheet], CellRange::single(addr), true);
        let mut roots = workbook.atom_context.table_dependent_atoms();
        roots.extend(workbook.sheets[self.sheet].store_root_atoms_for_addr(addr));
        let dependents = workbook.store.reverse_dependents(&roots);
        let mut arrays = workbook.array_dependents_for_atoms(&roots);
        arrays.extend(workbook.array_dependents_for_atoms(&dependents));
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = self.apply(workbook, false);
            if result.is_err() {
                return;
            }
            result = workbook.set_cell_input(self.sheet, &addr.to_string(), input);
            // Table 数据格不能成为 spill 锚点，失败必须还原输入与表定义。
            if result.is_ok()
                && workbook.sheets[self.sheet]
                    .spill_intersecting(CellRange::single(addr))
                    .is_some()
            {
                result = Err("Spilled arrays cannot be entered inside a table.");
            }
            if result.is_err() {
                before
                    .restore(workbook, self.sheet)
                    .expect("input keeps its worksheet");
                self.apply(workbook, true)
                    .expect("input rollback keeps the prepared table cells");
            } else {
                let after =
                    HistorySnapshot::capture(&workbook.sheets[self.sheet], before.range, true);
                self.cells.push((before.clone(), after));
            }
        });
        // 嵌套 batch 结束后重投既有数组，避免范围/输入先后次序泄露中间帧。
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result.map_err(str::to_string)
    }
}
