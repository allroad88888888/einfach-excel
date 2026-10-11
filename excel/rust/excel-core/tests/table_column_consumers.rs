//! 列改名覆盖规则/闭包，跨 Table 的裸引用不能全部改成同一个表的列。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, Workbook};
use support::{range, rule};

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    for (first, name, factor) in [(1, "Inventory", 10.0), (6, "OtherTable", 100.0)] {
        for (column, header) in [("A", "Product"), ("B", "Amount"), ("C", "Result")] {
            wb.set_cell(0, &format!("{column}{first}"), Value::Text(header.into()));
        }
        for offset in 1..=3 {
            wb.set_cell(
                0,
                &format!("B{}", first + offset),
                Value::Number(offset as f64 * factor),
            );
        }
        wb.define_table(
            Some(name),
            0,
            range(&format!("A{first}"), &format!("C{}", first + 3)),
            true,
        )
        .unwrap();
    }
    wb
}
fn bold(wb: &Workbook, address: &str) -> bool {
    wb.snapshot_display_format_range(0, range(address, address))
        .unwrap()
        .formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}
fn source(wb: &Workbook, address: &str) -> String {
    wb.sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse(address).unwrap())
        .unwrap()
}

#[test]
fn a_rule_crossing_two_tables_keeps_each_cells_own_column_context() {
    let mut wb = seed();
    let mut entry = rule("bare", range("C2", "C8"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":"=[@Amount]>15",
        "format":{"bold":true}})
    .to_string();
    wb.set_conditional_format_rule(0, 0, entry.clone()).unwrap();
    let expected: Vec<_> = (2..=8).map(|row| bold(&wb, &format!("C{row}"))).collect();
    assert_eq!(expected, [false, true, true, false, false, true, true]);
    assert!(wb.set_formula(0, "C2", "=[@Amount]*2"));
    assert!(wb.set_formula(0, "C7", "=[@Amount]*2"));
    let neighbor = source(&wb, "C7");
    let mut history = WorkbookHistory::default();
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
        .unwrap();
    for _ in 0..3 {
        assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.0));
        assert_eq!(wb.get_cell("Sheet1", "C7"), Value::Number(200.0));
        assert_eq!(source(&wb, "C7"), neighbor);
        assert_eq!(
            (2..=8)
                .map(|row| bold(&wb, &format!("C{row}")))
                .collect::<Vec<_>>(),
            expected
        );
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.conditional_format_config(0).unwrap().rules[0], entry);
        assert_eq!(source(&wb, "C2"), "=[@Amount]*2");
        history.redo(&mut wb).unwrap();
    }
}

#[test]
fn saved_and_cell_lambdas_keep_their_callers_table_after_column_rename() {
    let mut wb = seed();
    wb.define_name("CurrentAmount", "=LAMBDA(SUM([Amount]))")
        .unwrap();
    wb.define_name("ExplicitAmount", "=LAMBDA(SUM(Inventory[Amount]))")
        .unwrap();
    wb.define_name(
        "NestedAmount",
        "=LET(fn,LAMBDA(SUM([Amount])),LAMBDA(fn()))",
    )
    .unwrap();
    for (address, formula) in [
        ("C2", "=CurrentAmount()"),
        ("C7", "=CurrentAmount()"),
        ("C3", "=LAMBDA(SUM([Amount]))()"),
        ("C8", "=LAMBDA(SUM([Amount]))()"),
        ("C4", "=NestedAmount()"),
        ("C9", "=NestedAmount()"),
        ("E1", "=ExplicitAmount()"),
    ] {
        assert!(wb.set_formula(0, address, formula), "{address}: {formula}");
    }
    let check = |wb: &Workbook| {
        for address in ["C2", "C3", "C4", "E1"] {
            assert_eq!(
                wb.get_cell("Sheet1", address),
                Value::Number(60.0),
                "{address}"
            );
        }
        for address in ["C7", "C8", "C9"] {
            assert_eq!(
                wb.get_cell("Sheet1", address),
                Value::Number(600.0),
                "{address}"
            );
        }
    };
    check(&wb);
    let original_lambda = source(&wb, "C3");
    let mut history = WorkbookHistory::default();
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
        .unwrap();
    for _ in 0..3 {
        check(&wb);
        history.undo(&mut wb).unwrap();
        assert_eq!(source(&wb, "C3"), original_lambda);
        check(&wb);
        history.redo(&mut wb).unwrap();
    }
}
