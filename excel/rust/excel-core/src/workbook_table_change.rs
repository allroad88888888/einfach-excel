//! Table 定义变更的原子前后像；重命名与转换共用同一次消费者回放。
use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_rule_change::FormulaRuleChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;

#[derive(Debug)]
pub(crate) struct TableDefinitionChange {
    pub sheet: usize,
    pub range: CellRange,
    before: TableEntry,
    after: Option<TableEntry>,
    formulas: Vec<FormulaSourceChange>,
    rules: Vec<FormulaRuleChange>,
    lambdas: Vec<FormulaLambdaChange>,
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
            if old_key.is_none()
                && (workbook.tables.len() >= MAX_TABLES
                    || workbook.tables.values().any(|entry| {
                        entry.sheet_name() == next.sheet_name()
                            && entry.range().intersects(next.range())
                    }))
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
        let mut arrays =
            workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms());
        if !self.lambdas.is_empty() {
            arrays.extend(workbook.named_array_dependents());
        }
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(|sheet| sheet.suspend_structure_notifications())
            .collect();
        let store = workbook.store.clone();
        store.batch(|_| {
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
            workbook.bump_tables_epoch();
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, listeners) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(listeners);
        }
        Ok(())
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
    }
}
