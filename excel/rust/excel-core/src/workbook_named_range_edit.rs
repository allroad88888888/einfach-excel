//! 一次命名区域变更的原生前后状态；先预检，再原子发布名称与实际改写的公式。

use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_rule_change::FormulaRuleChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;

#[derive(Clone, Debug)]
pub enum NamedRangeAction {
    Create {
        name: String,
        sheet: usize,
        range: CellRange,
    },
    /// target 为 None 时只改名，也允许修饰已有 #REF! 定义的名称。
    Update {
        name: String,
        new_name: String,
        target: Option<(usize, CellRange)>,
    },
    Delete {
        name: String,
    },
}

#[derive(Debug)]
pub(crate) struct NamedRangeChange {
    before: Option<NamedEntry>,
    after: Option<NamedEntry>,
    formulas: Vec<FormulaSourceChange>,
    rules: Vec<FormulaRuleChange>,
    lambdas: Vec<FormulaLambdaChange>,
}

impl NamedRangeChange {
    pub(crate) fn mutation_ranges(&self) -> Vec<(usize, Option<CellRange>)> {
        self.formulas.iter().map(|change| (change.sheet, change.mutation_range())).collect()
    }

    pub(crate) fn prepare(
        workbook: &Workbook,
        action: NamedRangeAction,
    ) -> Result<Option<Self>, &'static str> {
        workbook.ensure_workbook_unprotected()?;
        let read = |name: &str| -> Result<NamedEntry, &'static str> {
            match workbook.named_values.get(&name.to_uppercase()) {
                Some(
                    entry @ NamedEntry {
                        definition: NamedDefinition::Range { .. },
                        ..
                    },
                ) => Ok(entry.clone()),
                _ => Err("The named range no longer exists."),
            }
        };
        let (before, after) = match action {
            NamedRangeAction::Create { name, sheet, range } => {
                let key = workbook
                    .validate_named_range_name(&name)
                    .map_err(name_error)?;
                if workbook.named_values.contains_key(&key) {
                    return Err("The name is already in use.");
                }
                let definition = workbook
                    .named_range_definition(sheet, range)
                    .map_err(name_error)?;
                (
                    None,
                    Some(NamedEntry {
                        canonical_name: name,
                        definition,
                    }),
                )
            }
            NamedRangeAction::Update {
                name,
                new_name,
                target,
            } => {
                let before = read(&name)?;
                let key = workbook
                    .validate_named_range_name(&new_name)
                    .map_err(name_error)?;
                if key != before.canonical_name.to_uppercase()
                    && workbook.named_values.contains_key(&key)
                {
                    return Err("The name is already in use.");
                }
                let definition = match target {
                    Some((sheet, range)) => workbook
                        .named_range_definition(sheet, range)
                        .map_err(name_error)?,
                    None => before.definition.clone(),
                };
                (
                    Some(before),
                    Some(NamedEntry {
                        canonical_name: new_name,
                        definition,
                    }),
                )
            }
            NamedRangeAction::Delete { name } => (Some(read(&name)?), None),
        };
        if before == after {
            return Ok(None);
        }
        let mut formulas = Vec::new();
        let mut rules = Vec::new();
        let mut lambdas = Vec::new();
        if let (Some(old), Some(new)) = (&before, &after) {
            if old.canonical_name != new.canonical_name {
                let rewrite = |expr: &mut Expr| {
                    crate::shift::rename_named_reference(
                        expr,
                        &old.canonical_name,
                        &new.canonical_name,
                    )
                };
                rules = FormulaRuleChange::prepare(workbook, &|_, _, expr| rewrite(expr));
                lambdas = FormulaLambdaChange::prepare(workbook, &rewrite);
                formulas = FormulaSourceChange::prepare(workbook, &|_, _, _, expr| rewrite(expr));
            }
        }
        Ok(Some(Self {
            before,
            after,
            formulas,
            rules,
            lambdas,
        }))
    }

    pub(crate) fn affected_sheets(&self, workbook: &Workbook, active: usize) -> Vec<usize> {
        let mut indices = BTreeSet::from([active]);
        for entry in self.before.iter().chain(&self.after) {
            if let NamedDefinition::Range { sheet_key, .. } = entry.definition {
                if let Some(index) = workbook.sheet_keys.iter().position(|key| *key == sheet_key) {
                    indices.insert(index);
                }
            }
        }
        indices.extend(self.formulas.iter().map(|formula| formula.sheet));
        indices.extend(self.rules.iter().filter_map(|change| {
            workbook
                .sheet_keys
                .iter()
                .position(|key| *key == change.sheet_key)
        }));
        indices.into_iter().collect()
    }

    pub(crate) fn label(&self) -> &'static str {
        match (&self.before, &self.after) {
            (None, _) => "Create named range",
            (_, None) => "Delete named range",
            _ => "Update named range",
        }
    }

    pub(crate) fn apply(&self, workbook: &mut Workbook, undo: bool) -> Result<(), &'static str> {
        workbook.ensure_workbook_unprotected()?;
        if workbook.is_inside_custom_call() {
            return Err("Cannot edit names during a custom call.");
        }
        let (expected, next) = if undo {
            (&self.after, &self.before)
        } else {
            (&self.before, &self.after)
        };
        let old_key = expected
            .as_ref()
            .map(|entry| entry.canonical_name.to_uppercase());
        let new_key = next
            .as_ref()
            .map(|entry| entry.canonical_name.to_uppercase());
        if let Some(key) = &old_key {
            if workbook.named_values.get(key) != expected.as_ref() {
                return Err("The name changed outside history.");
            }
        }
        if let Some(key) = &new_key {
            if workbook.tables.contains_key(key)
                || (new_key != old_key && workbook.named_values.contains_key(key))
            {
                return Err("The name is already in use.");
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
        let arrays = workbook.named_array_dependents();
        // 名称可以影响任意表的订阅；只暂存已有监听，不扫描或复制单元格。
        let observers: Vec<_> = (0..workbook.sheets.len())
            .map(|index| {
                (
                    index,
                    workbook.sheets[index].suspend_structure_notifications(),
                )
            })
            .collect();
        let store = workbook.store.clone();
        store.batch(|_| {
            if let Some(key) = old_key {
                workbook.named_values.remove(&key);
            }
            if let (Some(key), Some(entry)) = (new_key, next) {
                workbook.named_values.insert(key, entry.clone());
            }
            for rule in &self.rules {
                rule.apply(workbook, undo);
            }
            for lambda in &self.lambdas {
                lambda.apply(workbook, undo);
            }
            workbook.publish_atom_names();
            for formula in &self.formulas {
                formula.apply(workbook, undo);
            }
        });
        // Store batch 结束才传播间接依赖。先让公式值落定，再更新 spill 几何；
        // 否则 C1 已变成单格，E1=C1# 仍可能把缓存的旧数组重新装回去。
        workbook.recompute_array_formula_groups(arrays);
        for (index, listeners) in observers {
            workbook.sheets[index].resume_structure_notifications(listeners);
        }
        Ok(())
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.before
            .iter()
            .chain(&self.after)
            .map(|entry| entry.canonical_name.len() + std::mem::size_of::<NamedEntry>())
            .sum::<usize>()
            + self
                .formulas
                .iter()
                .map(FormulaSourceChange::retained_bytes)
                .sum::<usize>()
            + crate::sheet::metadata_bytes(&self.rules)
            + crate::sheet::metadata_bytes(&self.lambdas)
    }
}

fn name_error(error: WorkbookError) -> &'static str {
    match error {
        WorkbookError::ReservedName => "The name is reserved for a built-in function.",
        WorkbookError::NameConflict => "The name is already used by a table.",
        WorkbookError::EvalFailed(_) => "The named range target is invalid.",
        _ => "The defined name is invalid.",
    }
}
