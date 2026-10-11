//! Table 变更的原子前后像；定义、局部单元格与公式消费者共用历史回放。
use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_rule_change::FormulaRuleChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;
use crate::history_snapshot::HistorySnapshot;

#[path = "workbook_table_totals_change.rs"]
mod totals;
#[path = "workbook_table_column_change.rs"]
mod column;

#[derive(Debug)]
pub(crate) struct TableDefinitionChange {
    pub sheet: usize,
    pub range: CellRange,
    before: TableEntry,
    after: Option<TableEntry>,
    formulas: Vec<FormulaSourceChange>,
    rules: Vec<FormulaRuleChange>,
    lambdas: Vec<FormulaLambdaChange>,
    cells: Option<(HistorySnapshot, HistorySnapshot)>,
}

impl TableDefinitionChange {
    pub(crate) fn prepare_rename(
        workbook: &Workbook,
        name: &str,
        new_name: &str,
    ) -> Result<Option<Self>, TableError> {
        if workbook.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        let before = workbook
            .get_table(name)
            .ok_or(TableError::NotFound)?
            .clone();
        workbook.validate_table_name(new_name, Some(&name.to_ascii_uppercase()))?;
        if before.name() == new_name {
            return Ok(None);
        }
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or(TableError::SheetNotFound)?;
        let mut after = before.clone();
        after.canonical_name = new_name.into();
        let rewrite =
            |expr: &mut Expr| crate::shift::rename_table_reference(expr, before.name(), new_name);
        let formulas = FormulaSourceChange::prepare(workbook, &|_, _, expr| rewrite(expr));
        let rules = FormulaRuleChange::prepare(workbook, &|_, _, expr| rewrite(expr));
        let lambdas = FormulaLambdaChange::prepare(workbook, &rewrite);
        Ok(Some(Self {
            sheet,
            range: before.range(),
            before,
            after: Some(after),
            formulas,
            rules,
            lambdas,
            cells: None,
        }))
    }

    pub(crate) fn prepare_convert(workbook: &Workbook, name: &str) -> Result<Self, String> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot convert a table during a custom call.".into());
        }
        let before = workbook
            .get_table(name)
            .ok_or("The table no longer exists.")?
            .clone();
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or("The table worksheet no longer exists.")?;
        let table = before.to_resolved(sheet);
        let converter = crate::shift::TableToRange {
            name: before.name(),
            table: &table,
        };
        let rewrite = |sheet, range, expr: &mut Expr| converter.rewrite(expr, Some((sheet, range)));
        let formulas = FormulaSourceChange::prepare(workbook, &rewrite);
        let rules = FormulaRuleChange::prepare(workbook, &rewrite);
        let lambdas = FormulaLambdaChange::prepare(workbook, &|expr| converter.rewrite(expr, None));
        Ok(Self {
            sheet,
            range: before.range(),
            before,
            after: None,
            formulas,
            rules,
            lambdas,
            cells: None,
        })
    }

    pub(crate) fn affected_sheets(&self, workbook: &Workbook) -> Vec<usize> {
        let mut indices = BTreeSet::from([self.sheet]);
        indices.extend(self.formulas.iter().map(|formula| formula.sheet));
        indices.extend(self.rules.iter().filter_map(|rule| {
            workbook
                .sheet_keys
                .iter()
                .position(|key| *key == rule.sheet_key)
        }));
        indices.into_iter().collect()
    }

    pub(crate) fn apply(&self, workbook: &mut Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot change a table during a custom call.");
        }
        let (expected, next) = if undo {
            (self.after.as_ref(), Some(&self.before))
        } else {
            (Some(&self.before), self.after.as_ref())
        };
        let old_key = expected.map(|entry| entry.name().to_ascii_uppercase());
        let lookup_key = old_key
            .clone()
            .unwrap_or_else(|| self.before.name().to_ascii_uppercase());
        if workbook.tables.get(&lookup_key) != expected
            || workbook.name(self.sheet) != Some(self.before.sheet_name())
        {
            return Err("The table changed outside history.");
        }
        if let Some(next) = next {
            workbook
                .validate_table_name(next.name(), old_key.as_deref())
                .map_err(|_| "The table name is no longer available.")?;
            if (old_key.is_none() && workbook.tables.len() >= MAX_TABLES)
                || workbook.tables.iter().any(|(key, entry)| {
                    Some(key) != old_key.as_ref()
                        && entry.sheet_name() == next.sheet_name()
                        && entry.range().intersects(next.range())
                })
            {
                return Err("The table range or registry capacity is no longer available.");
            }
        }
        for formula in &self.formulas {
            formula.validate(workbook, undo)?;
        }
        for rule in &self.rules {
            rule.validate(workbook, undo)?;
        }
        for lambda in &self.lambdas {
            lambda.validate(workbook, undo)?;
        }
        let next_cells = if let Some((before, after)) = &self.cells {
            let (expected, next) = if undo {
                (after, before)
            } else {
                (before, after)
            };
            validate_cells(workbook, self.sheet, expected.range)?;
            if HistorySnapshot::capture(&workbook.sheets[self.sheet], expected.range, true)
                != *expected
            {
                return Err("The table cells changed outside history.");
            }
            Some(next)
        } else {
            None
        };
        let definition_changed = expected != next;
        let mut arrays = if definition_changed {
            workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms())
        } else {
            Vec::new()
        };
        if let Some(cells) = next_cells {
            // 表头/汇总快照仅覆盖一行；重装前保留现有依赖图中的数组消费者。
            // restore 内部的重投仍在嵌套 batch 中，必须等最外层失效传播后再投一次。
            let roots: Vec<_> = (cells.range.start.col..=cells.range.end.col)
                .flat_map(|col| {
                    workbook.sheets[self.sheet]
                        .store_root_atoms_for_addr(CellAddress::new(cells.range.start.row, col))
                })
                .collect();
            let dependents = workbook.store.reverse_dependents(&roots);
            arrays.extend(workbook.array_dependents_for_atoms(&dependents));
        }
        if !self.lambdas.is_empty() {
            arrays.extend(workbook.named_array_dependents());
        }
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(|sheet| sheet.suspend_structure_notifications())
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            if definition_changed {
                if let Some(key) = old_key {
                    workbook.tables.remove(&key);
                }
                if let Some(next) = next {
                    workbook
                        .tables
                        .insert(next.name().to_ascii_uppercase(), next.clone());
                }
                // 新定义先可见，安装重写后的公式时不会经历一次不存在的表名。
                workbook.sync_atom_tables();
            }
            if let Some(cells) = next_cells {
                result = cells.restore(workbook, self.sheet);
            }
            for rule in &self.rules {
                rule.apply(workbook, undo);
            }
            for lambda in &self.lambdas {
                lambda.apply(workbook, undo);
            }
            if !self.lambdas.is_empty() {
                workbook.publish_atom_names();
            }
            for formula in &self.formulas {
                formula.apply(workbook, undo);
            }
            // 只改某列汇总函数时让单元格 atom 自己传播，不失效整份 Table 目录。
            if definition_changed {
                workbook.bump_tables_epoch();
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, listeners) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(listeners);
        }
        result
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        crate::sheet::metadata_bytes(&self.before)
            + crate::sheet::metadata_bytes(&self.after)
            + self
                .formulas
                .iter()
                .map(FormulaSourceChange::retained_bytes)
                .sum::<usize>()
            + crate::sheet::metadata_bytes(&self.rules)
            + crate::sheet::metadata_bytes(&self.lambdas)
            + self.cells.as_ref().map_or(0, |(before, after)| {
                before.retained_bytes() + after.retained_bytes()
            })
    }
}

/// 表头/汇总单元格不能覆盖合并格或数组；在任何写入前检查。
fn validate_cells(workbook: &Workbook, sheet: usize, range: CellRange) -> Result<(), &'static str> {
    let target = workbook
        .sheet(sheet)
        .ok_or("The worksheet no longer exists.")?;
    if range.end.row > GRID_MAX_ROW
        || range.end.col > GRID_MAX_COL
        || target
            .merged_ranges()
            .iter()
            .any(|merged| merged.intersects(range))
        || target.spill_intersecting(range).is_some()
    {
        return Err("The table cells overlap a merge, spilled array or worksheet boundary.");
    }
    Ok(())
}
