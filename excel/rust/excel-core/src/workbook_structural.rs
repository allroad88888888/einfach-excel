//! workbook structural operations.

use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;

impl Workbook {
    pub fn tables_epoch(&self) -> u64 {
        self.tables_epoch
    }

    // --- Structural-follow wrappers (design doc §4.3) --------------------
    //
    // These delegate to the existing per-sheet structural ops (which do the
    // full cell/formula/spill/format/dimension retarget) and then remap
    // every Table anchored to that sheet. 显式跨表引用在同一 Store batch 内跟随。

    /// Insert `count` rows at `at` on `sheet_index`, then follow Tables.
    pub fn insert_rows(&mut self, sheet_index: usize, at: u32, count: u32) {
        let _ = self.try_structural_edit(
            sheet_index,
            crate::shift::ShiftEdit::RowInsert { at, count },
        );
    }

    /// Delete `count` rows at `at` on `sheet_index`, then follow Tables.
    pub fn delete_rows(&mut self, sheet_index: usize, at: u32, count: u32) {
        let _ = self.try_structural_edit(
            sheet_index,
            crate::shift::ShiftEdit::RowDelete { at, count },
        );
    }

    /// Insert `count` columns at `at` on `sheet_index`, then follow Tables.
    pub fn insert_columns(&mut self, sheet_index: usize, at: u32, count: u32) {
        let _ = self.try_structural_edit(
            sheet_index,
            crate::shift::ShiftEdit::ColInsert { at, count },
        );
    }

    /// Delete `count` columns at `at` on `sheet_index`, then follow Tables.
    pub fn delete_columns(&mut self, sheet_index: usize, at: u32, count: u32) {
        let _ = self.try_structural_edit(
            sheet_index,
            crate::shift::ShiftEdit::ColDelete { at, count },
        );
    }

    pub(super) fn apply_structural_shift_with_table_follow(
        &mut self,
        sheet_index: usize,
        edit: crate::shift::ShiftEdit,
    ) -> (Vec<FormulaLambdaChange>, Vec<FormulaSourceChange>) {
        if self.is_inside_custom_call() {
            return (Vec::new(), Vec::new());
        }
        let Some(name) = self.names.get(sheet_index).cloned() else {
            return (Vec::new(), Vec::new());
        };
        // 同一份实际位移差异交回历史层，不再扫描/改写闭包第二遍。
        let lambdas = FormulaLambdaChange::for_structural_shift(self, &name, edit);
        let ranges = self.shifted_named_ranges(sheet_index, edit);
        let templates = FormulaSourceChange::for_structural_templates(self, sheet_index, edit);
        let store = self.store.clone();
        store.batch(|_| {
            self.shift_sheet_and_tables(sheet_index, edit);
            // 包含目标表自己的 Sheet1!A1 写法；同表裸引用已经由 Sheet 位移处理。
            for sheet in &mut self.sheets {
                sheet.retarget_sheet_references(&name, edit);
            }
            // 最终坐标落地后再发布名称，数组引用不会读到一半位移的来源。
            for lambda in &lambdas {
                lambda.apply(self, false);
            }
            for template in &templates { template.apply(self, false); }
            self.restore_named_range_coordinates(&ranges, false);
            if ranges.is_empty() && !lambdas.is_empty() {
                self.sync_atom_names();
            }
        });
        (lambdas, templates)
    }

    fn shift_sheet_and_tables(&mut self, sheet_index: usize, edit: crate::shift::ShiftEdit) {
        if self.is_inside_custom_call() {
            return; // re-entrancy guard, mirrors the cell mutators
        }
        if sheet_index >= self.sheets.len() {
            return;
        }
        // Delegate to the existing sheet-level structural op — same path
        // the wasm binding uses today, so cells/formulas/spills/formats
        // all follow exactly as before.
        match edit {
            crate::shift::ShiftEdit::RowInsert { at, count } => {
                self.sheets[sheet_index].insert_row(at, count)
            }
            crate::shift::ShiftEdit::RowDelete { at, count } => {
                self.sheets[sheet_index].delete_row(at, count)
            }
            crate::shift::ShiftEdit::ColInsert { at, count } => {
                self.sheets[sheet_index].insert_col(at, count)
            }
            crate::shift::ShiftEdit::ColDelete { at, count } => {
                self.sheets[sheet_index].delete_col(at, count)
            }
        }
        self.remap_tables_after_shift(sheet_index, edit);
        for owner in 0..self.sheets.len() {
            let rules = self.shifted_conditional_format_rules(owner, sheet_index, edit);
            self.replace_conditional_format_rules(owner, rules)
                .expect("structural preflight checked conditional-format revision");
        }
        // Hidden-row eval inputs are row-indexed too, so a row edit must
        // displace the numbers inside each set exactly as it displaced the
        // cells. Column edits displace nothing in a row set. See
        // `WorkbookAtomContext::shift_hidden_rows_after_row_edit` for why this
        // cannot double-shift against the host's own re-push.
        match edit {
            crate::shift::ShiftEdit::RowInsert { at, count } => {
                self.atom_context
                    .shift_hidden_rows_after_row_edit(sheet_index, at, count, true);
                // `Sheet::apply_structural_shift` already displaced the OWNED
                // set through the same `shift_hidden_row` arithmetic, so this
                // republish normally finds the mirror already correct and
                // fires nothing. It is here so the owning side has the last
                // word: the mirror is a projection, never an independent
                // maintainer of the fact.
                self.republish_hidden(sheet_index);
            }
            crate::shift::ShiftEdit::RowDelete { at, count } => {
                self.atom_context
                    .shift_hidden_rows_after_row_edit(sheet_index, at, count, false);
                self.republish_hidden(sheet_index);
            }
            crate::shift::ShiftEdit::ColInsert { .. }
            | crate::shift::ShiftEdit::ColDelete { .. } => {}
        }
    }

    // --- internal helpers ----------------------------------------------

    /// Bump the Table invalidation broadcast counter (design doc §8) and
    /// publish the change reactively. Two effects, in order:
    ///   1. `sync_atom_tables` refreshes the formula-inner provider's Table
    ///      projection so structured references resolve against current
    ///      geometry.
    ///   2. `atom_context.bump_tables_epoch` `store.set(+1)`s the shared
    ///      `tables_epoch` atom, waking exactly the formulas that resolved a
    ///      Table (they hold a `depend_tables` edge) — cross-sheet included,
    ///      since the whole workbook shares one Store.
    pub(crate) fn bump_tables_epoch(&mut self) {
        self.tables_epoch = self.tables_epoch.wrapping_add(1);
        self.sync_atom_tables();
        self.atom_context.bump_tables_epoch();
    }

    /// Full Table name mutex (design doc §4.2). `exclude_key` is the
    /// uppercased key of the Table being renamed (so a case-only rename
    /// doesn't collide with itself); `None` for a fresh `define_table`.
    pub(crate) fn validate_table_name(
        &self,
        name: &str,
        exclude_key: Option<&str>,
    ) -> Result<(), TableError> {
        if Self::validate_name(name).is_err() {
            return Err(TableError::InvalidName);
        }
        let key = name.to_ascii_uppercase();
        if is_builtin_function_name(&key) {
            return Err(TableError::ReservedName);
        }
        if name_is_cell_ref_like(name) {
            return Err(TableError::NameLikeCellRef);
        }
        // Shared namespace: reject collisions with other Tables …
        let collides_table = match exclude_key {
            Some(self_key) => key != self_key && self.tables.contains_key(&key),
            None => self.tables.contains_key(&key),
        };
        if collides_table {
            return Err(TableError::NameConflict);
        }
        // … and with defined names (forward direction of §4.2's mutex).
        if self.named_values.contains_key(&key) {
            return Err(TableError::NameConflict);
        }
        Ok(())
    }

    /// First free `Table1`, `Table2`, … not already used by a Table or a
    /// defined name (shared namespace). `TableN` is never cell-ref-like
    /// (column `TABLE` is past `XFD`) nor a built-in, so those checks are
    /// unnecessary here.
    pub(crate) fn next_auto_table_name(&self) -> String {
        let mut n: usize = 1;
        loop {
            let candidate = format!("Table{n}");
            let key = candidate.to_ascii_uppercase();
            if !self.tables.contains_key(&key) && !self.named_values.contains_key(&key) {
                return candidate;
            }
            n += 1;
        }
    }

    /// Read the header row's cell text into column names, disambiguating
    /// blanks/duplicates to `Column1`, `Column2`, … (design doc §4.1). Runs
    /// before the registry mutation so it only needs `&self`.
    pub(crate) fn derive_column_names(&self, sheet_name: &str, range: CellRange) -> Vec<String> {
        let width = range.cols();
        let header_row = range.start.row;
        let mut names: Vec<String> = Vec::with_capacity(width as usize);
        let mut used: HashSet<String> = HashSet::new();
        for i in 0..width {
            let addr = CellAddress::new(header_row, range.start.col + i);
            let raw = self.header_text(sheet_name, addr);
            let trimmed = raw.trim();
            let name = if trimmed.is_empty() || used.contains(&trimmed.to_ascii_uppercase()) {
                next_auto_column_name(&used)
            } else {
                trimmed.to_string()
            };
            used.insert(name.to_ascii_uppercase());
            names.push(name);
        }
        names
    }

    /// Best-effort display text of a header cell, for column naming. Reads
    /// through the normal evaluation path (header cells are usually plain
    /// text/number literals). Non-scalar/error values yield an empty
    /// string so the caller auto-names that column.
    pub(super) fn header_text(&self, sheet_name: &str, addr: CellAddress) -> String {
        match self.get_cell(sheet_name, &addr.to_string_repr()) {
            Value::Text(s) => s,
            Value::Number(n) => format!("{n}"),
            Value::Boolean(b) => {
                if b {
                    "TRUE".to_string()
                } else {
                    "FALSE".to_string()
                }
            }
            _ => String::new(),
        }
    }
}
