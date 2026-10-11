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
fn rules_crossing_table_context_keep_their_per_cell_meaning() {
    let mut wb = seed();
    wb.set_cell(0, "D1", Value::Text("Amount".into()));
    wb.set_cell(0, "D2", Value::Number(50.0));
    wb.define_table(Some("OtherTable"), 0, range("D1", "E3"), true)
        .unwrap();
    install(&mut wb, 0, "row", "B1", "E4", "=[@Amount]>15");
    let original = wb.conditional_format_config(0).unwrap().rules.clone();
    let addresses = ["B1", "B2", "B3", "B4", "C2", "D2", "E2", "E4"];
    let expected: Vec<_> = addresses.iter().map(|addr| bold(&wb, 0, addr)).collect();
    assert_eq!(
        expected,
        [false, false, true, false, false, true, true, false]
    );
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    assert_eq!(history.undo_count(), 1);
    for _ in 0..3 {
        for (addr, expected) in addresses.iter().zip(&expected) {
            assert_eq!(bold(&wb, 0, addr), *expected, "{addr}");
        }
        assert_eq!(
            wb.conditional_format_config(0).unwrap().rules.len(),
            1,
            "do not split one rule into a collection of per-cell rules"
        );
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.conditional_format_config(0).unwrap().rules, original);
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "A2", Value::Number(19.0));
    wb.set_cell(0, "D2", Value::Number(5.0));
    assert!(bold(&wb, 0, "B2"));
    assert!(!bold(&wb, 0, "E2"));
}
