use einfach_core::Value;
use einfach_excel_core::{builtin_function_catalog, parse_formula, CellAddress, EvalProvider};
use einfach_excel_core::eval::eval_expr_with_provider;

pub(super) struct HelpProvider;
impl EvalProvider for HelpProvider {
    fn cell(&self, addr: CellAddress) -> Value {
        match (addr.row, addr.col) {
            (row @ 0..=2, 0) => Value::Number((row + 1) as f64),
            (row @ 0..=2, 1) => Value::Number([2.0, 4.0, 7.0][row as usize]),
            (row @ 0..=2, 2) => Value::Number([0.2, 0.3, 0.5][row as usize]),
            (0, 3 | 6 | 7) => Value::Text("Key".into()),
            (0, 4) => Value::Text("Value".into()),
            (row @ 1..=3, 3) => Value::Number(row as f64),
            (row @ 1..=3, 4) => Value::Number((row * 10) as f64),
            (1, 6) => Value::Text(">0".into()),
            (1, 7) => Value::Number(2.0),
            (row @ 0..=2, 9) => Value::Number([-100.0, 60.0, 60.0][row as usize]),
            _ => Value::Null,
        }
    }
    fn sheet_cell(&self, _sheet: &str, addr: CellAddress) -> Value { self.cell(addr) }
    fn current_cell(&self) -> Option<CellAddress> { CellAddress::parse("A1") }
    fn current_sheet_index(&self) -> Option<usize> { Some(0) }
    fn cell_formula_text(&self, _addr: CellAddress) -> Option<String> { Some("=1+2".into()) }
}

#[test]
fn every_compiled_function_has_complete_bilingual_parameter_help() {
    let catalog = builtin_function_catalog();
    let mut failures = Vec::new();
    assert_eq!(catalog.len(), if cfg!(feature = "regex-formulas") { 502 } else { 499 });
    for function in &catalog {
        let help = &function.help;
        assert!(!help.summary.is_empty(), "{}", function.name);
        assert!(!help.summary_zh.is_empty(), "{}", function.name);
        assert!(!help.examples.is_empty(), "{}", function.name);
        for arg in &help.args {
            assert!(!arg.name.is_empty() && arg.name != "args", "{}", function.name);
            assert!(!arg.description.is_empty() && !arg.description_zh.is_empty(), "{}", function.name);
        }
        if let Some(group) = &help.repeat {
            assert!(group.length > 0 && group.start + group.length <= help.args.len());
            assert!(help.args[group.start..group.start + group.length].iter().all(|arg| arg.repeats));
        }
        for example in &help.examples {
            let expr = parse_formula(example).unwrap_or_else(|| panic!("Unparseable help example: {example}"));
            let value = eval_expr_with_provider(&expr, &HelpProvider);
            if matches!(value, Value::Error(_)) && function.name != "NA" {
                failures.push(format!("{example}: {value:?}"));
            }
        }
    }
    assert!(failures.is_empty(), "Help example errors:\n{}", failures.join("\n"));
    assert_eq!(serde_json::to_value(&catalog).unwrap()[0]["help"]["summary_zh"].is_string(), true);
}

#[test]
fn aliases_share_real_signatures_but_examples_use_each_alias_name() {
    let catalog = builtin_function_catalog();
    for (canonical, aliases) in [
        ("RANK.EQ", vec!["RANK", "RANKEQ"]),
        ("BETA.INV", vec!["BETAINV"]),
        ("MODE", vec!["MODE.SNGL"]),
        ("NORM.DIST", vec!["NORMDIST"]),
        ("STDEV.P", vec!["STDEVP"]),
        ("JIS", vec!["DBCS"]),
    ] {
        let original = &catalog.iter().find(|entry| entry.name == canonical).unwrap().help;
        for alias in aliases {
            let help = &catalog.iter().find(|entry| entry.name == alias).unwrap().help;
            assert_eq!(help.args, original.args, "{alias}");
            assert!(help.examples[0].starts_with(&format!("={alias}(")));
        }
    }
    let modern = &catalog.iter().find(|entry| entry.name == "BETA.DIST").unwrap().help;
    let legacy = &catalog.iter().find(|entry| entry.name == "BETADIST").unwrap().help;
    assert_eq!(modern.args.len(), legacy.args.len() + 1);
    assert_eq!(modern.args[3].name, "cumulative");
    assert_eq!(legacy.args[3].name, "lower_bound");
}
