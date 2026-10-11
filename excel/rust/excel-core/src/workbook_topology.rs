//! workbook topology operations.

use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;

impl Workbook {
    pub fn add_sheet(&mut self, name: &str) -> usize {
        if self.is_inside_custom_call() {
            // Re-entrancy guard. Return the existing index if the name
            // happens to exist (idempotent — matches the dup-name branch
            // below) or 0 (Sheet1, always exists) so the caller gets a
            // valid-shaped result. This is the infallible signature; a
            // host that needs the rejection should query
            // `is_inside_custom_call` before calling.
            return self.by_name.get(name).copied().unwrap_or(0);
        }
        if let Some(&idx) = self.by_name.get(name) {
            return idx;
        }
        let idx = self.sheets.len();
        // P3: every sheet shares the workbook's single store, so cross-sheet
        // dependencies can live as ordinary in-store edges (P6).
        self.sheets.push(Sheet::with_store(self.store.clone()));
        self.sheet_keys.push(self.next_sheet_key);
        self.next_sheet_key += 1;
        self.names.push(name.to_string());
        self.print_configs.push(Default::default());
        self.conditional_formats.push(Default::default());
        self.by_name.insert(name.to_string(), idx);
        self.sync_atom_topology();
        idx
    }

    pub fn sheet_count(&self) -> usize {
        self.sheets.len()
    }

    /// 工作簿内单调分配；改名/移动/撤销删除不换身份，重新创建同名表也不复用旧身份。
    pub fn sheet_key(&self, index: usize) -> Option<u64> {
        self.sheet_keys.get(index).copied()
    }

    pub fn name(&self, idx: usize) -> Option<&str> {
        self.names.get(idx).map(String::as_str)
    }

    pub fn index_of(&self, name: &str) -> Option<usize> {
        self.by_name.get(name).copied()
    }

    pub fn sheet(&self, idx: usize) -> Option<&Sheet> {
        self.sheets.get(idx)
    }

    pub fn sheet_mut(&mut self, idx: usize) -> Option<&mut Sheet> {
        self.sheets.get_mut(idx)
    }

    pub fn sheet_by_name(&self, name: &str) -> Option<&Sheet> {
        self.index_of(name).and_then(|i| self.sheet(i))
    }

    pub fn sheet_by_name_mut(&mut self, name: &str) -> Option<&mut Sheet> {
        self.index_of(name).and_then(move |i| self.sheet_mut(i))
    }

    /// Rename a sheet. Fails (returns false) if the new name is taken.
    ///
    /// Retarget static references before publishing the renamed topology.
    pub fn rename_sheet(&mut self, idx: usize, new_name: &str) -> bool {
        self.rename_sheet_with_formula_consumers(idx, new_name, None, None, None)
    }

    /// 历史给出原始规则、闭包与模板差异，避免逆向改写碰到原先悬空的新表名引用。
    pub(super) fn rename_sheet_with_formula_consumers(
        &mut self,
        idx: usize,
        new_name: &str,
        restored: Option<&ConditionalRuleSources>,
        restored_lambdas: Option<(&[FormulaLambdaChange], bool)>,
        restored_templates: Option<(&[FormulaSourceChange], bool)>,
    ) -> bool {
        if self.is_inside_custom_call() {
            return false; // re-entrancy guard
        }
        if self.by_name.contains_key(new_name) {
            return false;
        }
        if idx >= self.names.len() {
            return false;
        }
        let rewrites = self.sheet_ref_rewrites(&self.names[idx], Some(new_name));
        let conditional = restored.cloned().unwrap_or_else(|| {
            self.conditional_sheet_ref_rewrites(&self.names[idx], Some(new_name))
        });
        if self
            .validate_conditional_rule_sources(&conditional)
            .is_err()
        {
            return false;
        }
        let prepared;
        let (lambdas, undo) = match restored_lambdas {
            Some(restored) => restored,
            None => {
                prepared =
                    FormulaLambdaChange::for_sheet_refs(self, &self.names[idx], Some(new_name));
                (prepared.as_slice(), false)
            }
        };
        if lambdas
            .iter()
            .any(|change| change.validate(self, undo).is_err())
        {
            return false;
        }
        let prepared_templates;
        let (templates, template_undo) = match restored_templates {
            Some(restored) => restored,
            None => {
                prepared_templates = FormulaSourceChange::for_sheet_templates(
                    self, &self.names[idx], Some(new_name));
                (prepared_templates.as_slice(), false)
            }
        };
        if templates.iter().any(|change| change.validate(self, template_undo).is_err()) {
            return false;
        }
        let store = self.store.clone();
        store.batch(|_| {
            let old = std::mem::take(&mut self.names[idx]);
            self.by_name.remove(&old);
            self.names[idx] = new_name.to_string();
            self.by_name.insert(new_name.to_string(), idx);
            // Table anchor maintenance (design doc #32 §4.4): entries are
            // anchored by sheet NAME, so re-point every Table on the renamed
            // sheet. Bump the epoch only if at least one Table moved.
            let mut table_moved = false;
            for entry in self.tables.values_mut() {
                if entry.sheet_name == old {
                    entry.sheet_name = new_name.to_string();
                    table_moved = true;
                }
            }
            if table_moved {
                self.bump_tables_epoch();
            }
            for lambda in lambdas {
                lambda.apply(self, undo);
            }
            for template in templates { template.apply(self, template_undo); }
            if !lambdas.is_empty() {
                self.publish_atom_names();
            }
            // 新名字与闭包一起落地，再由拓扑发布修复受影响的 spill。
            self.sync_atom_topology();
            self.apply_conditional_rule_sources(&conditional);
            for (sheet, addr, text) in rewrites {
                self.set_formula(sheet, &addr.to_string_repr(), &text);
            }
        });
        true
    }

    pub(crate) fn rebuild_name_lookup(&mut self) {
        self.by_name.clear();
        for (idx, name) in self.names.iter().enumerate() {
            self.by_name.insert(name.clone(), idx);
        }
    }

    /// Move a sheet from `from` to its final index `to`.
    ///
    /// Formula ASTs store sheet names, so reordering updates the shared
    /// topology atom after the vectors and lookup are rebuilt.
    pub fn move_sheet(&mut self, from: usize, to: usize) -> bool {
        if self.is_inside_custom_call() {
            return false; // re-entrancy guard
        }
        if from >= self.sheets.len() || to >= self.sheets.len() {
            return false;
        }
        if from == to {
            return true;
        }

        let sheet = self.sheets.remove(from);
        let key = self.sheet_keys.remove(from);
        let name = self.names.remove(from);
        let print_config = self.print_configs.remove(from);
        let conditional_format = self.conditional_formats.remove(from);
        self.sheets.insert(to, sheet);
        self.sheet_keys.insert(to, key);
        self.names.insert(to, name);
        self.print_configs.insert(to, print_config);
        self.conditional_formats.insert(to, conditional_format);
        // The index-keyed hidden-row side stores must ride the same rotation
        // the sheet vector just underwent (see `remove_sheet`).
        self.atom_context
            .remap_hidden_rows_after_sheet_move(from, to);
        self.rebuild_name_lookup();
        self.sync_atom_topology();
        self.republish_hidden_all(); // see `remove_sheet`
        true
    }
}
