//! An atomic registry change preserves cells and invalidates native name consumers.
use super::*;

#[derive(Debug)]
pub struct CustomFormulaChange {
    key: String,
    before: Option<NamedEntry>,
    after: Option<NamedEntry>,
}

impl CustomFormulaChange {
    pub(crate) fn prepare(
        workbook: &Workbook,
        action: CustomFormulaAction,
    ) -> Result<Option<Self>, &'static str> {
        // Recompute may touch every sheet: guard before definitions or history writes.
        workbook.ensure_workbook_unprotected()?;
        let (key, after) = match action {
            CustomFormulaAction::Upsert { definition } => {
                let definition = validation::normalize(definition)?;
                let key = definition.name.clone();
                if workbook.tables.contains_key(&key)
                    || workbook.named_values.get(&key).is_some_and(|entry| {
                        !matches!(entry.definition, NamedDefinition::CustomFormula(_))
                    })
                {
                    return Err("The custom formula name is already in use.");
                }
                if workbook
                    .custom_function_registry()
                    .is_some_and(|registry| registry.contains(&key))
                {
                    return Err("The custom formula name is already in use.");
                }
                let mut definitions: std::collections::BTreeMap<_, _> = workbook
                    .custom_formula_definitions()
                    .into_iter()
                    .map(|definition| (definition.name.clone(), definition))
                    .collect();
                definitions.insert(key.clone(), definition.clone());
                if definitions.len() > MAX_CUSTOM_FORMULAS {
                    return Err("Too many custom formulas.");
                }
                validation::ensure_resolved(&definition, &definitions)?;
                validation::ensure_acyclic(&definitions)?;
                (
                    key.clone(),
                    Some(NamedEntry {
                        canonical_name: key,
                        definition: NamedDefinition::CustomFormula(definition),
                    }),
                )
            }
            CustomFormulaAction::Remove { name } => {
                let key = name.trim().to_uppercase();
                if !workbook.named_values.get(&key).is_some_and(|entry| {
                    matches!(entry.definition, NamedDefinition::CustomFormula(_))
                }) {
                    return Ok(None);
                }
                (key, None)
            }
        };
        let before = workbook.named_values.get(&key).cloned();
        if before == after {
            return Ok(None);
        }
        Ok(Some(Self { key, before, after }))
    }

    pub(crate) fn label(&self) -> &'static str {
        if self.after.is_none() {
            "Remove custom formula"
        } else if self.before.is_some() {
            "Replace custom formula"
        } else {
            "Register custom formula"
        }
    }

    pub(crate) fn apply(&self, workbook: &mut Workbook, undo: bool) -> Result<(), &'static str> {
        workbook.ensure_workbook_unprotected()?;
        let expected = if undo { &self.after } else { &self.before };
        if workbook.named_values.get(&self.key) != expected.as_ref() {
            return Err("The custom formula changed outside history.");
        }
        let next = if undo { &self.before } else { &self.after };
        if let Some(entry) = next {
            workbook
                .named_values
                .insert(self.key.clone(), entry.clone());
        } else {
            workbook.named_values.remove(&self.key);
        }
        workbook.sync_atom_names();
        Ok(())
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        [&self.before, &self.after]
            .into_iter()
            .flatten()
            .map(|entry| {
                if let NamedDefinition::CustomFormula(definition) = &entry.definition {
                    definition.name.len()
                        + definition.expression.len()
                        + definition.parameters.iter().map(String::len).sum::<usize>()
                        + 128
                } else {
                    128
                }
            })
            .sum::<usize>()
            + self.key.len()
    }
}
