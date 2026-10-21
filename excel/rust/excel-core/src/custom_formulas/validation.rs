//! Native definition validation is also applied to untrusted file input.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

fn identifier(value: &str) -> Result<String, &'static str> {
    let name = value.trim().to_uppercase();
    let r1c1 = name
        .strip_prefix('R')
        .and_then(|rest| rest.split_once('C'))
        .is_some_and(|(row, col)| {
            !row.is_empty()
                && !col.is_empty()
                && row.bytes().all(|b| b.is_ascii_digit())
                && col.bytes().all(|b| b.is_ascii_digit())
        });
    let mut chars = name.chars();
    if !chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        || name.len() > 255
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
        || matches!(name.as_str(), "R" | "C")
        || r1c1
        || !matches!(
            crate::parse_formula(&format!("={name}")),
            Some(Expr::Name(_))
        )
    {
        return Err(
            "Use a formula name beginning with a letter or underscore, without cell references.",
        );
    }
    Ok(name)
}

pub(super) fn normalize(
    mut definition: CustomFormulaDefinition,
) -> Result<CustomFormulaDefinition, &'static str> {
    definition.name = identifier(&definition.name)?;
    if crate::is_builtin_function_name(&definition.name) {
        return Err("The custom formula name conflicts with a built-in function.");
    }
    if definition.parameters.len() > MAX_CUSTOM_FORMULA_PARAMETERS {
        return Err("Use at most 64 custom formula parameters.");
    }
    let mut parameters = BTreeSet::new();
    for parameter in &mut definition.parameters {
        *parameter = identifier(parameter)?;
        if !parameters.insert(parameter.clone()) {
            return Err("Custom formula parameters must be unique.");
        }
    }
    definition.expression = definition.expression.trim().to_owned();
    if !definition.expression.starts_with('=') {
        definition.expression.insert(0, '=');
    }
    if definition.expression.chars().count() > MAX_CUSTOM_FORMULA_EXPRESSION {
        return Err("Use at most 8192 characters in a custom formula expression.");
    }
    let ast =
        crate::parse_formula(&definition.expression).ok_or("Enter a valid formula expression.")?;
    calls(&ast, &parameters, &mut BTreeSet::new())?;
    Ok(definition)
}

/// Reject address-bound definitions: callers pass cells/ranges as arguments.
/// This keeps definitions stable through sheet renames and row/column edits.
fn calls(
    expr: &Expr,
    scope: &BTreeSet<String>,
    result: &mut BTreeSet<String>,
) -> Result<(), &'static str> {
    match expr {
        Expr::CellRef(..) | Expr::Range { .. } | Expr::SheetRef { .. } |
        Expr::SheetRange { .. } | Expr::TableRef { .. } | Expr::MultiArea(_) |
        Expr::DynamicRange { .. } | Expr::SpillRef(_) =>
            return Err("Pass cell and range references as custom formula arguments."),
        Expr::FuncCall { name, args } => {
            if matches!(name.as_str(), "INDIRECT" | "OFFSET" | "CELL" | "ROW" | "COLUMN" |
                "SHEET" | "SHEETS" | "FORMULATEXT" | "ISFORMULA" | "INFO") {
                return Err("Pass cell and range references as custom formula arguments.");
            }
            if name == "LET" || name == "LAMBDA" {
                let lambda = name == "LAMBDA";
                if args.is_empty() || (!lambda && (args.len() < 3 || args.len() % 2 == 0)) {
                    return Err("Enter a valid LET or LAMBDA expression.");
                }
                let mut local = scope.clone();
                let bindings = &args[..args.len() - 1];
                let mut declared = BTreeSet::new();
                let step = if lambda { 1 } else { 2 };
                for index in (0..bindings.len()).step_by(step) {
                    let Expr::Name(parameter) = &bindings[index] else {
                        return Err("Use valid local LET or LAMBDA parameter names.");
                    };
                    let parameter = identifier(parameter)?;
                    if lambda && !declared.insert(parameter.clone()) {
                        return Err("Custom formula parameters must be unique.");
                    }
                    if !lambda { calls(&bindings[index + 1], &local, result)?; }
                    local.insert(parameter);
                }
                calls(args.last().unwrap(), &local, result)?;
            } else {
                if !scope.contains(name) { result.insert(name.to_uppercase()); }
                for arg in args { calls(arg, scope, result)?; }
            }
        }
        Expr::Call(callee, args) => {
            calls(callee, scope, result)?;
            for arg in args { calls(arg, scope, result)?; }
        }
        Expr::Name(name) if !scope.contains(&name.to_uppercase()) =>
            return Err("Use only declared parameters and local LET or LAMBDA names in custom formula expressions."),
        Expr::BinOp { left, right, .. } => { calls(left, scope, result)?; calls(right, scope, result)?; }
        Expr::Negate(value) | Expr::Percent(value) => calls(value, scope, result)?,
        Expr::ArrayLit { data, .. } => for value in data { calls(value, scope, result)?; },
        _ => {}
    }
    Ok(())
}

pub(super) fn ensure_acyclic(
    definitions: &BTreeMap<String, CustomFormulaDefinition>,
) -> Result<(), &'static str> {
    let mut graph = BTreeMap::new();
    for (name, definition) in definitions {
        let ast = crate::parse_formula(&definition.expression)
            .ok_or("Enter a valid formula expression.")?;
        let mut edges = BTreeSet::new();
        calls(
            &ast,
            &definition.parameters.iter().cloned().collect(),
            &mut edges,
        )?;
        graph.insert(name.clone(), edges);
    }
    fn visit(
        name: &str,
        graph: &BTreeMap<String, BTreeSet<String>>,
        active: &mut BTreeSet<String>,
        done: &mut BTreeSet<String>,
    ) -> Result<(), &'static str> {
        if done.contains(name) {
            return Ok(());
        }
        if !active.insert(name.into()) {
            return Err("Custom formula definitions cannot contain a recursive call cycle.");
        }
        if let Some(edges) = graph.get(name) {
            for edge in edges {
                if graph.contains_key(edge) {
                    visit(edge, graph, active, done)?;
                }
            }
        }
        active.remove(name);
        done.insert(name.into());
        Ok(())
    }
    let mut done = BTreeSet::new();
    for name in graph.keys() {
        visit(name, &graph, &mut BTreeSet::new(), &mut done)?;
    }
    Ok(())
}

pub(super) fn ensure_resolved(
    definition: &CustomFormulaDefinition,
    definitions: &BTreeMap<String, CustomFormulaDefinition>,
) -> Result<(), &'static str> {
    let ast =
        crate::parse_formula(&definition.expression).ok_or("Enter a valid formula expression.")?;
    let mut edges = BTreeSet::new();
    calls(
        &ast,
        &definition.parameters.iter().cloned().collect(),
        &mut edges,
    )?;
    if edges
        .iter()
        .any(|name| !crate::is_builtin_function_name(name) && !definitions.contains_key(name))
    {
        return Err("Call only built-in functions or registered custom formulas in custom formula expressions.");
    }
    Ok(())
}
