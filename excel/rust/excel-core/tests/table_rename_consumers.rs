//! Table 改名覆盖规则与闭包；这些消费者不能在前端做字符串替换。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.define_table(Some("Inventory"), 0, range("A1", "A3"), true)
        .unwrap();
    wb
}
fn install(wb: &mut Workbook, sheet: usize, id: &str, formula: &str) {
    let mut entry = rule(id, range("B1", "B2"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
        "format":{"bold":true}})
    .to_string();
    let revision = wb.conditional_format_config(sheet).unwrap().revision;
    wb.set_conditional_format_rule(sheet, revision, entry)
        .unwrap();
}
fn bold(wb: &Workbook, sheet: usize) -> bool {
    wb.snapshot_display_format_range(sheet, range("B1", "B1"))
        .unwrap()
        .formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}

#[test]
fn conditional_formulas_rewrite_both_forms_and_preserve_unrelated_rules_on_undo() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    install(
        &mut wb,
        other,
        "table",
        "= LET(Stock,7,SUM(Inventory)+SUM(Inventory[Amount])+Stock) > 60",
    );
    let original = wb.conditional_format_config(other).unwrap().rules[0].clone();
    assert!(bold(&wb, other));
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    assert!(bold(&wb, other));
    assert!(wb.conditional_format_config(other).unwrap().rules[0]
        .rule_json
        .contains("Stock[Amount]"));
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    install(&mut wb, other, "unrelated", "=FALSE");
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        let rules = wb.conditional_format_config(other).unwrap().rules;
        assert_eq!(rules[0], original);
        assert_eq!(rules[1].id, "unrelated");
        assert!(bold(&wb, other));
        history.redo(&mut wb).unwrap();
        assert!(bold(&wb, other));
    }
}

#[test]
fn saved_lambdas_preserve_parameters_captures_and_nested_closures() {
    let mut wb = seed();
    for (name, formula) in [
        (
            "WithParam",
            "=LAMBDA(Stock,SUM(Inventory)+SUM(Inventory[Amount])+Stock)",
        ),
        ("Captured", "=LET(Stock,7,LAMBDA(x,SUM(Inventory)+Stock+x))"),
        (
            "Nested",
            "=LET(fn,LAMBDA(SUM(Inventory[Amount])),LAMBDA(fn()))",
        ),
        (
            "Shadowed",
            "=LAMBDA(Inventory,Inventory+SUM(Inventory[Amount]))",
        ),
        ("Unrelated", "=LAMBDA(Inventory,Inventory+1)"),
    ] {
        wb.define_name(name, formula).unwrap();
    }
    let unrelated = wb.get_named("Unrelated").unwrap();
    for (address, formula) in [
        ("D1", "=WithParam(7)"),
        ("D2", "=Captured(0)"),
        ("D3", "=Nested()"),
        ("D4", "=Shadowed(9)"),
    ] {
        assert!(wb.set_formula(0, address, formula));
    }
    let check = |wb: &Workbook| {
        for (address, value) in [("D1", 67.0), ("D2", 37.0), ("D3", 30.0), ("D4", 39.0)] {
            assert_eq!(
                wb.get_cell("Sheet1", address),
                Value::Number(value),
                "{address}"
            );
        }
    };
    check(&wb);
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    assert_eq!(wb.get_named("Unrelated"), Some(unrelated));
    check(&wb);
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        check(&wb);
        history.redo(&mut wb).unwrap();
        check(&wb);
    }
    wb.set_cell(0, "A2", Value::Number(40.0));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(127.0));
}

#[test]
fn external_consumer_edits_reject_undo_before_renaming_the_table() {
    let mut wb = seed();
    install(&mut wb, 0, "table", "=SUM(Inventory[Amount])>0");
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    install(&mut wb, 0, "table", "=FALSE");
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Stock").is_some());
    assert_eq!(history.undo_count(), 1);

    let mut wb = seed();
    wb.define_name("Compute", "=LAMBDA(SUM(Inventory[Amount]))")
        .unwrap();
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    wb.define_name("Compute", "=LAMBDA(99)").unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Stock").is_some());
    wb.set_formula(0, "D1", "=Compute()");
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(99.0));
}
