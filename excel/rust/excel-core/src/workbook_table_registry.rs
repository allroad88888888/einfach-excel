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
        let key = canonical_name.to_ascii_uppercase();

        let columns = self.derive_column_names(&sheet_name, range);

        self.tables.insert(
            key,
            TableEntry {
                canonical_name: canonical_name.clone(),
                sheet_name,
                range,
                has_headers,
                has_totals: false,
                columns,
            },
        );
        self.bump_tables_epoch();
        Ok(canonical_name)
    }

    /// Remove a Table's registry entry ("convert to range" — design doc
    /// §4.1). Cell values, formulas, and formats are left in place; only
    /// the Table semantics are dropped. `TableError::NotFound` when the
    /// name is unknown.
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

    /// Rename a Table (design doc §4.1 / §4.3). Re-validates `new_name`
    /// against the full name mutex (grammar / built-in / cell-ref-form /
    /// conflict), excluding the Table's own current key so a case-only
    /// rename works, then rewrites the TEXT of every formula that references
    /// the old name (`OldName[…]` → `NewName[…]`) across all sheets.
    pub fn rename_table(&mut self, name: &str, new_name: &str) -> Result<(), TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        let old_key = name.to_ascii_uppercase();
        if !self.tables.contains_key(&old_key) {
            return Err(TableError::NotFound);
        }
        self.validate_table_name(new_name, Some(&old_key))?;
        let new_key = new_name.to_ascii_uppercase();
        // Remove-then-reinsert (the key changes unless it's a case-only
        // rename, which `validate_table_name`'s self-exclusion permits).
        let mut entry = self
            .tables
            .remove(&old_key)
            .expect("existence checked above");
        entry.canonical_name = new_name.to_string();
        self.tables.insert(new_key, entry);
        // Sync the projection to the new name BEFORE rewriting referencing
        // formulas so their re-install resolves the renamed Table.
        self.sync_atom_tables();
        let spec = crate::shift::TableRefEditSpec::RenameTable {
            from: old_key,
            to: new_name.to_string(),
        };
        self.rewrite_table_refs_across_sheets(&spec, None);
        self.bump_tables_epoch();
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
    // The undo primitive for Table DEFINITION changes. Everything a Table
    // op writes into CELLS (the totals row's `SUBTOTAL` formulas, the cell
    // moves a structural edit performs) is already covered by the host's
    // sparse-cell and format snapshots; what had no before-image until now
    // is the registry itself — name, sheet anchor, range, header/totals
    // flags, column names. These two calls close that gap, and the host
    // pairs them with the existing cell primitives inside one undo
    // transaction.

    /// Capture the entire Table registry (see [`TableRegistrySnapshot`] for
    /// why this is REPLACE rather than additive). Pure read — no epoch bump,
    /// no reactive traffic.
    pub fn snapshot_tables(&self) -> TableRegistrySnapshot {
        TableRegistrySnapshot {
            entries: self.tables.values().cloned().collect(),
        }
    }
}
