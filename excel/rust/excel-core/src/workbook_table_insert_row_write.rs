//! 内容写入把空表输入位置变成记录；仅保存实际涉及的原生 Table 定义供历史回放。
use super::*;
use crate::history_snapshot::HistorySnapshot;

impl Workbook {
    pub(crate) fn insert_rows_for_ranges(
        &self,
        ranges: &[(usize, CellRange, bool)],
    ) -> Vec<TableEntry> {
        self.tables
            .values()
            .filter(|table| table.insert_row)
            .filter(|table| {
                ranges.iter().any(|(sheet, range, content)| {
                    *content
                        && self.name(*sheet) == Some(table.sheet_name())
                        && range.intersects(input_row(table))
                })
            })
            .cloned()
            .collect()
    }

    /// 按行索引候选表，仅遍历本次写入地址；不为大批量导入逐格扫描整个注册表。
    pub(crate) fn insert_rows_for_writes(
        &self,
        writes: impl IntoIterator<Item = (usize, CellAddress)>,
    ) -> Vec<TableEntry> {
        let mut rows: BTreeMap<(usize, u32), Vec<&TableEntry>> = BTreeMap::new();
        for table in self.tables.values().filter(|table| table.insert_row) {
            if let Some(sheet) = self.index_of(table.sheet_name()) {
                rows.entry((sheet, input_row(table).start.row))
                    .or_default()
                    .push(table);
            }
        }
        if rows.is_empty() {
            return Vec::new();
        }
        let mut result = Vec::new();
        for (sheet, addr) in writes {
            let Some(tables) = rows.get_mut(&(sheet, addr.row)) else {
                continue;
            };
            if let Some(index) = tables.iter().position(|table| table.range.contains(addr)) {
                result.push(tables.swap_remove(index).clone());
            }
        }
        result
    }

    /// 原始值落地后、公式消费者及输入校验读取前发布记录状态；清空和 spill 子格不创建记录。
    pub(crate) fn write_with_insert_rows<R>(
        &mut self,
        rows: Vec<TableEntry>,
        write: impl FnOnce(&mut Self) -> R,
    ) -> R {
        if rows.is_empty() {
            return write(self);
        }
        let arrays = self.array_dependents_for_atoms(&self.atom_context.table_dependent_atoms());
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = self.store.clone();
        let mut result = None;
        store.batch(|_| {
            result = Some(write(self));
            let mut changed = false;
            for before in rows {
                let key = before.name().to_ascii_uppercase();
                if !self.tables.get(&key).is_some_and(|table| table.insert_row) {
                    continue;
                }
                if self.insert_row_has_content(&before) {
                    self.tables.get_mut(&key).unwrap().insert_row = false;
                    changed = true;
                }
            }
            if changed {
                self.bump_tables_epoch();
            }
        });
        self.recompute_array_formula_groups(arrays);
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result.expect("the write runs exactly once")
    }

    /// 写入与扩列共用内容判定：只读这一行的稀疏格，空结果公式仍然是记录。
    pub(super) fn insert_row_has_content(&self, table: &TableEntry) -> bool {
        let sheet = &self.sheets[self.index_of(table.sheet_name()).unwrap()];
        let mut content = false;
        sheet.for_each_non_empty_in_range(input_row(table), |addr| {
            if !sheet.spill_anchor_for(addr).is_some_and(|anchor| anchor != addr)
                && (sheet.has_formula_at(addr) || sheet.peek_value(addr) != Value::Null) {
                content = true;
            }
        });
        content
    }

    /// 首次批量输入与单格输入遵守相同的 Table 数组限制，含被占用格挡住的数组。
    pub(crate) fn validate_insert_row_arrays(
        &self,
        rows: &[TableEntry],
    ) -> Result<(), &'static str> {
        for table in rows {
            let sheet = &self.sheets[self.index_of(table.sheet_name()).unwrap()];
            let range = input_row(table);
            if sheet.spill_intersecting(range).is_some()
                || sheet
                    .blocked_anchor_addresses()
                    .iter()
                    .any(|addr| range.contains(*addr))
            {
                return Err("Spilled arrays cannot be entered inside a table.");
            }
        }
        Ok(())
    }

    /// 格子历史只反转受影响表的定义；其它表的外部修改不被整份注册表快照覆盖。
    pub(crate) fn restore_cell_history(
        &mut self,
        snapshots: &[(usize, HistorySnapshot)],
        rows: &[TableEntry],
        undo: bool,
    ) -> Result<(), &'static str> {
        if rows.is_empty() {
            return self.restore_history_snapshots(snapshots);
        }
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        if snapshots
            .iter()
            .any(|(sheet, _)| self.sheet(*sheet).is_none())
        {
            return Err("History worksheet no longer exists.");
        }
        for before in rows {
            if self.get_table(before.name()) != Some(&before.clone().with_insert_row(!undo)) {
                return Err("The table changed outside history.");
            }
        }
        let arrays = self.array_dependents_for_atoms(&self.atom_context.table_dependent_atoms());
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = self.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            for before in rows {
                self.tables.insert(
                    before.name().to_ascii_uppercase(),
                    before.clone().with_insert_row(undo),
                );
            }
            self.bump_tables_epoch();
            result = self.restore_history_snapshots(snapshots);
        });
        self.recompute_array_formula_groups(arrays);
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}

fn input_row(table: &TableEntry) -> CellRange {
    let row = table.range.start.row + u32::from(table.has_headers);
    CellRange::new(
        CellAddress::new(row, table.range.start.col),
        CellAddress::new(row, table.range.end.col),
    )
}
