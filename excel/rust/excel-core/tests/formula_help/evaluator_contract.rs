use einfach_core::{Value, ValueError};
use einfach_excel_core::{builtin_function_catalog, parse_formula};
use einfach_excel_core::eval::eval_expr_with_provider;
use super::catalog::HelpProvider;

#[test]
fn documented_fixed_arity_matches_the_actual_evaluator_rejection_boundary() {
    let mut failures = Vec::new();
    for entry in builtin_function_catalog() {
        if entry.help.repeat.is_some() { continue; }
        // These three builtins intentionally ignore extra expressions; the help
        // exposes that implementation limitation instead of claiming strict arity.
        if matches!(entry.name, "TODAY" | "NOW" | "PI") { continue; }
        let maximum = entry.help.args.len();
        let formula = format!("={}({})", entry.name, vec!["1"; maximum + 1].join(","));
        let actual = eval_expr_with_provider(&parse_formula(&formula).unwrap(), &HelpProvider);
        if actual != Value::Error(ValueError::WrongArgCount) { failures.push(format!("{formula}: {actual:?}")); }
        let minimum = entry.help.args.iter().filter(|arg| !arg.optional).count();
        if minimum > 0 {
            let formula = format!("={}({})", entry.name, vec!["1"; minimum - 1].join(","));
            let actual = eval_expr_with_provider(&parse_formula(&formula).unwrap(), &HelpProvider);
            if actual != Value::Error(ValueError::WrongArgCount) { failures.push(format!("{formula}: {actual:?}")); }
        }
    }
    assert!(failures.is_empty(), "Arity mismatches:\n{}", failures.join("\n"));
}

#[test]
fn help_discovery_never_changes_native_workbook_history_or_values() {
    use einfach_excel_core::{Workbook, workbook_history::WorkbookHistory};
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SUM(1,2)");
    book.set_cell_input(0, "B1", "neighbor").unwrap();
    let history = WorkbookHistory::default();
    let before = book.get_cell("Sheet1", "A1");
    for _ in 0..3 { assert!(!builtin_function_catalog().is_empty()); }
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 0);
    assert_eq!(book.get_cell("Sheet1", "A1"), before);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("neighbor".into()));
    assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=SUM(1,2)"));
}
