//! 规则与闭包引用的转换；不能静默忽略尚不能保真的调用上下文。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, Workbook};
use support::{range, rule};

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.define_table(Some("Inventory"), 0, range("A1", "B3"), true)
        .unwrap();
    wb
}
fn install(wb: &mut Workbook, sheet: usize, id: &str, start: &str, end: &str, formula: &str) {
    let mut entry = rule(id, range(start, end), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
        "format":{"bold":true}})
    .to_string();
    let revision = wb.conditional_format_config(sheet).unwrap().revision;
    wb.set_conditional_format_rule(sheet, revision, entry)
        .unwrap();
}
fn bold(wb: &Workbook, sheet: usize, addr: &str) -> bool {
    let addr = CellAddress::parse(addr).unwrap();
    wb.snapshot_display_format_range(sheet, einfach_excel_core::CellRange::single(addr))
        .unwrap()
        .formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}

#[test]
fn whole_table_and_local_row_conditional_rules_remain_live_after_conversion() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    install(
        &mut wb,
        other,
        "whole",
        "A1",
        "A3",
        "=SUM(Inventory[Amount])>25",
    );
    install(&mut wb, 0, "row", "B2", "B3", "=[@Amount]>15");
    let original = wb.conditional_format_config(0).unwrap().rules[0].clone();
    assert!(!bold(&wb, 0, "B2"));
    assert!(bold(&wb, 0, "B3"));
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    for _ in 0..3 {
        assert!(bold(&wb, other, "A1"));
        assert!(!bold(&wb, 0, "B2"));
        assert!(bold(&wb, 0, "B3"));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.conditional_format_config(0).unwrap().rules[0], original);
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "A2", Value::Number(19.0));
    assert!(bold(&wb, 0, "B2"));
}

#[test]
fn saved_lambdas_keep_live_range_references_and_local_parameters() {
    let mut wb = seed();
    for (name, formula) in [
        ("Compute", "=LAMBDA(SUM(Inventory[Amount]))"),
        ("Nested", "=LET(fn,LAMBDA(SUM(Inventory)),LAMBDA(fn()))"),
        (
            "Local",
            "=LAMBDA(Inventory,Inventory+SUM(Inventory[Amount]))",
        ),
    ] {
        wb.define_name(name, formula).unwrap();
    }
    for (addr, formula) in [
        ("D1", "=Compute()"),
        ("D2", "=Nested()"),
        ("D3", "=Local(7)"),
    ] {
        assert!(wb.set_formula(0, addr, formula));
    }
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    for _ in 0..3 {
        assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(37.0));
        history.undo(&mut wb).unwrap();
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "A2", Value::Number(40.0));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(60.0));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(60.0));
}

#[test]
fn unresolved_caller_relative_lambdas_reject_before_any_registry_or_formula_write() {
    for lambda in ["=LAMBDA(Inventory[@Amount])", "=LAMBDA([@Amount])"] {
        let mut wb = seed();
        wb.define_name("CallerRow", lambda).unwrap();
        wb.set_formula(0, "D1", "=SUM(Inventory[Amount])");
        let mut history = WorkbookHistory::default();
        history
            .rename_table(&mut wb, "Inventory", "Renamed")
            .unwrap();
        history.undo(&mut wb).unwrap();
        let tables = wb.snapshot_tables();
        let closure = wb.get_named("CallerRow");
        assert!(history
            .convert_table_to_range(&mut wb, "Inventory")
            .is_err());
        assert_eq!(wb.snapshot_tables(), tables);
        assert_eq!(wb.get_named("CallerRow"), closure);
        assert_eq!(history.redo_count(), 1);
        assert_eq!(
            wb.sheet(0)
                .unwrap()
                .formula_text_at(CellAddress::parse("D1").unwrap())
                .as_deref(),
            Some("=SUM(Inventory[Amount])")
        );
    }
}

#[test]
fn rules_crossing_table_context_reject_atomically_until_supported() {
    let mut wb = seed();
    install(&mut wb, 0, "row", "B2", "B4", "=[@Amount]>15");
    let original = wb.conditional_format_config(0).unwrap();
    let mut history = WorkbookHistory::default();
    assert!(history
        .convert_table_to_range(&mut wb, "Inventory")
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert!(wb.get_table("Inventory").is_some());
    assert_eq!(wb.conditional_format_config(0).unwrap(), original);
}
