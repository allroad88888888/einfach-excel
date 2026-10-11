//! workbook table registry operations.

use super::*;

impl Workbook {
    pub fn define_table(
        &mut self,
        name: Option<&str>,
        sheet_index: usize,
        range: CellRange,
        has_headers: bool,
    ) -> Result<String, TableError> {
        let entry = self.prepare_table(name, sheet_index, range, has_headers)?;
        let canonical_name = entry.canonical_name.clone();
        self.tables.insert(canonical_name.to_ascii_uppercase(), entry);
        self.bump_tables_epoch();
        Ok(canonical_name)
    }

    /// 先完整校验并派生列名；原生创建历史与低层注册共用，预检不写注册表。
    pub(super) fn prepare_table(
        &self,
        name: Option<&str>,
        sheet_index: usize,
        range: CellRange,
        has_headers: bool,
    ) -> Result<TableEntry, TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        if sheet_index >= self.sheets.len() {
            return Err(TableError::SheetNotFound);
        }
        let range = range.normalize();
        let sheet_name = self.names[sheet_index].clone();

        // Overlap check against existing tables on the SAME sheet.
        if self
            .tables
            .values()
            .any(|t| t.sheet_name == sheet_name && ranges_overlap(t.range, range))
        {
            return Err(TableError::RangeOverlap);
        }

        // Cap check happens before name resolution so a rejected 257th
        // table never perturbs the auto-name counter.
        if self.tables.len() >= MAX_TABLES {
            return Err(TableError::TooManyTables);
        }

        let canonical_name = match name {
            Some(n) => {
                self.validate_table_name(n, None)?;
                n.to_string()
            }
            None => self.next_auto_table_name(),
        };
        let columns = self.derive_column_names(&sheet_name, range);
        Ok(TableEntry {
            canonical_name,
            sheet_name,
            range,
            has_headers,
            has_totals: false,
            insert_row: false,
            columns,
            style: crate::TableStyle::default(),
            calculated_columns: Vec::new(),
            auto_filter: None,
        })
    }

    /// 仅删除低层注册项，引用它的公式会失效；这不是用户的“转换为区域”。
    /// 交互转换使用 WorkbookHistory::convert_table_to_range，同时改写公式并记录历史。
    pub fn delete_table(&mut self, name: &str) -> Result<(), TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        let key = name.to_ascii_uppercase();
        if self.tables.remove(&key).is_none() {
            return Err(TableError::NotFound);
        }
        self.bump_tables_epoch();
        Ok(())
    }

    /// 底层直接调用与原生历史共用一个改名操作；包括裸表名、规则与保存的闭包。
    /// 此入口不记录历史，交互命令使用 WorkbookHistory::rename_table。
    pub fn rename_table(&mut self, name: &str, new_name: &str) -> Result<(), TableError> {
        if let Some(change) = TableDefinitionChange::prepare_rename(self, name, new_name)? {
            change.apply(self, false).map_err(|_| TableError::FormulaRewriteConflict)?;
        }
        Ok(())
    }

    /// 低层调用与用户历史复用同一个原子改名，表头、目录及公式消费者不再分开写。
    pub fn rename_table_column(
        &mut self,
        table_name: &str,
        old_column: &str,
        new_column: &str,
    ) -> Result<(), TableError> {
        if let Some(change) = TableDefinitionChange::prepare_column_rename(
            self, table_name, old_column, new_column,
        )? {
            change.apply(self, false).map_err(|_| TableError::FormulaRewriteConflict)?;
        }
        Ok(())
    }

    /// Case-insensitive Table lookup. `None` when no Table is registered
    /// under `name`.
    pub fn get_table(&self, name: &str) -> Option<&TableEntry> {
        self.tables.get(&name.to_ascii_uppercase())
    }

    /// Every registered Table, in stable (alphabetical-by-uppercased-name)
    /// order.
    pub fn list_tables(&self) -> Vec<&TableEntry> {
        self.tables.values().collect()
    }

    /// Number of registered Tables. Companion to the `MAX_TABLES` cap.
    pub fn table_count(&self) -> usize {
        self.tables.len()
    }

    // --- Registry snapshot / restore (design doc #32 §11/§12) ------------
    //
    // 低层注册快照用于恢复已有元数据，不包含表头/公式，不能单独充当交互撤销。
    // 用户命令的全部前后像与回放顺序由 WorkbookHistory 负责。

    /// Capture the entire Table registry (see [`TableRegistrySnapshot`] for
    /// why this is REPLACE rather than additive). Pure read — no epoch bump,
    /// no reactive traffic.
    pub fn snapshot_tables(&self) -> TableRegistrySnapshot {
        TableRegistrySnapshot {
            entries: self.tables.values().cloned().collect(),
        }
    }
}
