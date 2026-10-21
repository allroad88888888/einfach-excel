//! User definitions remain source expressions in the native name registry.
mod callable_scope;
mod change;
mod validation;
pub use change::CustomFormulaChange;

use crate::eval::ExcelLambda;
use crate::workbook::{NamedDefinition, NamedEntry};
use crate::{Expr, Workbook};
use einfach_core::{Value, ValueError};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub const MAX_CUSTOM_FORMULAS: usize = 256;
pub const MAX_CUSTOM_FORMULA_PARAMETERS: usize = 64;
pub const MAX_CUSTOM_FORMULA_EXPRESSION: usize = 8192;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomFormulaDefinition {
    pub name: String,
    pub parameters: Vec<String>,
    pub expression: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CustomFormulaAction {
    Upsert { definition: CustomFormulaDefinition },
    Remove { name: String },
}

impl CustomFormulaDefinition {
    /// The existing native LAMBDA evaluator owns coercion, errors and arrays.
    /// Unlike ordinary LAMBDA, this product API requires every declared slot.
    pub fn lambda_value(&self, is_custom: impl Fn(&str) -> bool) -> Value {
        let Some(mut body) = crate::parse_formula(&self.expression) else {
            return Value::Error(ValueError::InvalidName);
        };
        callable_scope::restrict(
            &mut body,
            &self.parameters.iter().cloned().collect(),
            &is_custom,
        );
        if !self.parameters.is_empty() {
            body = Expr::FuncCall {
                name: "IF".into(),
                args: vec![
                    Expr::FuncCall {
                        name: "OR".into(),
                        args: self
                            .parameters
                            .iter()
                            .map(|parameter| Expr::FuncCall {
                                name: "ISOMITTED".into(),
                                args: vec![Expr::Name(parameter.clone())],
                            })
                            .collect(),
                    },
                    Expr::Error(ValueError::WrongArgCount),
                    body,
                ],
            };
        }
        Value::Lambda(Arc::new(ExcelLambda {
            params: self.parameters.clone(),
            body,
            captured: Vec::new(),
        }))
    }
}

impl Workbook {
    /// This is a projection of the sole native registry, never a UI mirror.
    pub fn custom_formula_definitions(&self) -> Vec<CustomFormulaDefinition> {
        self.named_values
            .values()
            .filter_map(|entry| match &entry.definition {
                NamedDefinition::CustomFormula(definition) => Some(definition.clone()),
                _ => None,
            })
            .collect()
    }

    /// Fresh file-open only. Validate the complete set before installing any entry;
    /// forward references are allowed but duplicate definitions and cycles are not.
    pub fn restore_custom_formula_definitions(
        &mut self,
        definitions: Vec<CustomFormulaDefinition>,
    ) -> Result<(), &'static str> {
        self.ensure_workbook_unprotected()?;
        if self.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        if !self.custom_formula_definitions().is_empty() {
            return Err("Custom formulas must be restored into a fresh workbook.");
        }
        if definitions.len() > MAX_CUSTOM_FORMULAS {
            return Err("Too many custom formulas.");
        }
        let mut next = std::collections::BTreeMap::new();
        for definition in definitions {
            let definition = validation::normalize(definition)?;
            if self.named_values.contains_key(&definition.name)
                || self.tables.contains_key(&definition.name)
            {
                return Err("The custom formula name is already in use.");
            }
            if self
                .custom_function_registry()
                .is_some_and(|registry| registry.contains(&definition.name))
            {
                return Err("The custom formula name is already in use.");
            }
            if next.insert(definition.name.clone(), definition).is_some() {
                return Err("Duplicate custom formula in workbook file.");
            }
        }
        validation::ensure_acyclic(&next)?;
        for (name, definition) in next {
            self.named_values.insert(
                name.clone(),
                NamedEntry {
                    canonical_name: name,
                    definition: NamedDefinition::CustomFormula(definition),
                },
            );
        }
        self.sync_atom_names();
        Ok(())
    }
}
