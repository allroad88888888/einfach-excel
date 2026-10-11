//! 一次命名区域变更的原生前后状态；先预检，再原子发布名称与实际改写的公式。

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
struct FormulaRename {
    sheet: usize,
    sheet_key: u64,
    addr: CellAddress,
    before: String,
    after: String,
}

#[derive(Debug)]
pub(crate) struct NamedRangeChange {
    before: Option<NamedEntry>,
    after: Option<NamedEntry>,
    formulas: Vec<FormulaRename>,
}

impl NamedRangeChange {
    pub(crate) fn prepare(
        workbook: &Workbook,
        action: NamedRangeAction,
    ) -> Result<Option<Self>, &'static str> {
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
        if let (Some(old), Some(new)) = (&before, &after) {
            if old.canonical_name != new.canonical_name {
                let all = CellRange::new(
                    CellAddress::new(0, 0),
                    CellAddress::new(GRID_MAX_ROW, GRID_MAX_COL),
                );
                for (index, sheet) in workbook.sheets.iter().enumerate() {
                    let mut addresses: Vec<_> =
                        sheet.formula_addrs_in_range(all).into_iter().collect();
                    addresses.sort_by_key(|addr| (addr.row, addr.col));
                    for addr in addresses {
                        let Some(before) = sheet.formula_text_at(addr) else {
                            continue;
                        };
                        let Some(mut expr) = parse_formula(&before) else {
                            continue;
                        };
                        if crate::shift::rename_named_reference(
                            &mut expr,
                            &old.canonical_name,
                            &new.canonical_name,
                        ) {
                            formulas.push(FormulaRename {
                                sheet: index,
                                sheet_key: workbook.sheet_keys[index],
                                addr,
                                before,
                                after: crate::render_formula(&expr),
                            });
                        }
                    }
                }
            }
        }
        Ok(Some(Self {
            before,
            after,
            formulas,
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
            let source = if undo {
                &formula.after
            } else {
                &formula.before
            };
            if workbook.sheet_key(formula.sheet) != Some(formula.sheet_key)
                || workbook.sheets[formula.sheet]
                    .formula_text_at(formula.addr)
                    .as_ref()
                    != Some(source)
            {
                return Err("A referring formula changed outside history.");
            }
        }
        let arrays = workbook.named_array_dependents();
        // bulk formula restoration has direct address listeners; defer them until every source is final.
        let observers: Vec<_> = self
            .formulas
            .iter()
            .map(|formula| formula.sheet)
            .collect::<BTreeSet<_>>()
            .into_iter()
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
            workbook.publish_atom_names();
            for formula in &self.formulas {
                let source = if undo {
                    &formula.before
                } else {
                    &formula.after
                };
                workbook.sheets[formula.sheet].restore_formula_source(formula.addr, source);
            }
            workbook.recompute_array_formula_groups(arrays);
        });
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
                .map(|formula| {
                    formula.before.len()
                        + formula.after.len()
                        + std::mem::size_of::<FormulaRename>()
                })
                .sum::<usize>()
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
