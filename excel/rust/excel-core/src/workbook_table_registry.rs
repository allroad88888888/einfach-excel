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
            columns,
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

    /// Rename one column of a Table (design doc §4.1 / §4.3; the engine half
    /// of the I3 header-edit → column-rename story). Updates the registry
    /// column name — the source of truth for `Table[Col]` resolution — and
    /// rewrites the TEXT of every referencing formula (`Table[Old]` →
    /// `Table[New]`, plus table-less `[Old]` inside the Table's own cells).
    ///
    /// The visible HEADER CELL text is left untouched: the canonical trigger
    /// (§I3) is a header-cell edit, which already carries the new text, and
    /// resolution reads the registry, not the header cell. A direct call
    /// (e.g. a Name Manager rename) thus lags the header display until the
    /// host writes it — a documented MVP boundary.
    pub fn rename_table_column(
        &mut self,
        table_name: &str,
        old_column: &str,
        new_column: &str,
    ) -> Result<(), TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        if new_column.trim().is_empty() {
            return Err(TableError::InvalidColumnName);
        }
        let key = table_name.to_ascii_uppercase();
        let Some(entry) = self.tables.get(&key) else {
            return Err(TableError::NotFound);
        };
        let col_idx = entry
            .columns
            .iter()
            .position(|c| c.eq_ignore_ascii_case(old_column))
            .ok_or(TableError::ColumnNotFound)?;
        // Collision with a DIFFERENT column is rejected; a case-only rename
        // of the same column is allowed.
        if entry
            .columns
            .iter()
            .enumerate()
            .any(|(i, c)| i != col_idx && c.eq_ignore_ascii_case(new_column))
        {
            return Err(TableError::DuplicateColumn);
        }
        let anchor_sheet = entry.sheet_name.clone();
        let table_range = entry.range;
        self.tables
            .get_mut(&key)
            .expect("existence checked above")
            .columns[col_idx] = new_column.to_string();
        self.sync_atom_tables();
        let spec = crate::shift::TableRefEditSpec::RenameColumn {
            table_upper: key,
            from: old_column.to_string(),
            to: new_column.to_string(),
        };
        self.rewrite_table_refs_across_sheets(&spec, Some((&anchor_sheet, table_range)));
        self.bump_tables_epoch();
        Ok(())
    }

    /// Rewrite structured-reference formula text across every sheet per
    /// `spec` (design doc §4.3). `anchor` is `Some((sheet_name, range))` for
    /// a column rename, so table-less `[Col]` references inside the Table's
    /// own cells on its anchor sheet are rewritten too; `None` for a table
    /// rename (bare references carry no table name and never match).
    ///
    /// Collect (immutable sheet reads) then apply (`set_formula`) in two
    /// passes: the borrow checker forbids holding a sheet borrow across the
    /// mutable re-install, and the apply pass reuses the proven formula-edit
    /// path (parking, cycle check, subscriber notification).
    fn rewrite_table_refs_across_sheets(
        &mut self,
        spec: &crate::shift::TableRefEditSpec,
        anchor: Option<(&str, CellRange)>,
    ) {
        let mut rewrites: Vec<(usize, CellAddress, String)> = Vec::new();
        for idx in 0..self.sheets.len() {
            let bare_range = match anchor {
                Some((sheet_name, range)) if self.names[idx].as_str() == sheet_name => Some(range),
                _ => None,
            };
            let bare_for = |addr: CellAddress| bare_range.is_some_and(|r| r.contains(addr));
            for (addr, text) in self.sheets[idx].collect_table_ref_rewrites(spec, &bare_for) {
                rewrites.push((idx, addr, text));
            }
        }
        for (idx, addr, text) in rewrites {
            let a1 = addr.to_string_repr();
            self.set_formula(idx, &a1, &text);
        }
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
