//! 范围调整的消费者与局部历史边界；不以主表可见值代替跨表响应证据。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellFormat, CellRange, TableEntry, TableRegistrySnapshot, Workbook,
};
use std::{cell::Cell, rc::Rc};
use support::{range, rule};

fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    for (first, name) in [(1, "Inventory"), (6, "Neighbor")] {
        for (column, header) in [("A", "Product"), ("B", "Amount"), ("C", "Result")] {
            wb.set_cell(0, &format!("{column}{first}"), Value::Text(header.into()));
        }
        wb.set_cell(0, &format!("B{}", first + 1), Value::Number(20.));
        wb.define_table(
            Some(name),
            0,
            range(&format!("A{first}"), &format!("C{}", first + 2)),
            true,
        )
        .unwrap();
    }
    (wb, WorkbookHistory::default())
}

#[test]
fn removed_columns_rewrite_rules_and_saved_lambdas_without_affecting_neighbor_tables() {
    let (mut wb, mut history) = seed();
    wb.define_name("GetProduct", "=LAMBDA(SUM([Product]))")
        .unwrap();
    wb.set_cell(0, "A2", Value::Number(1.));
    wb.set_cell(0, "A7", Value::Number(10.));
    wb.set_formula(0, "C2", "=GetProduct()");
    wb.set_formula(0, "C7", "=GetProduct()");
    let mut entry = rule("bare", range("C2", "C8"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":"=SUM([Product])>0",
        "format":{"bold":true}})
    .to_string();
    wb.set_conditional_format_rule(0, 0, entry.clone()).unwrap();
    history
        .resize_table(&mut wb, "Inventory", range("B1", "C3"))
        .unwrap();
    for _ in 0..3 {
        assert_eq!(
            wb.get_cell("Sheet1", "C2"),
            Value::Error(ValueError::InvalidRef)
        );
        assert_eq!(wb.get_cell("Sheet1", "C7"), Value::Number(10.));
        assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(1.));
        let formats = wb
            .snapshot_display_format_range(0, range("C2", "C7"))
            .unwrap();
        assert!(!formats
            .formats
            .cell_styles
            .iter()
            .any(|(addr, style)| addr.row == 1 && style.bold == Some(true)));
        assert!(formats
            .formats
            .cell_styles
            .iter()
            .any(|(addr, style)| addr.row == 6 && style.bold == Some(true)));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(1.));
        assert_eq!(wb.conditional_format_config(0).unwrap().rules[0], entry);
        history.redo(&mut wb).unwrap();
    }
}

#[test]
fn changing_range_notifies_once_and_undo_does_not_restore_unrelated_body_cells() {
    let (mut wb, mut history) = seed();
    let other = wb.add_sheet("Report");
    wb.set_cell(0, "B4", Value::Number(30.));
    wb.set_formula(other, "A1", "=SUM(Inventory[Amount])");
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    let subscription = wb
        .sheet_mut(other)
        .unwrap()
        .subscribe_cell("A1", move || observed.set(observed.get() + 1));
    hits.set(0);
    history
        .resize_table(&mut wb, "Inventory", range("A1", "C4"))
        .unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Report", "A1"), Value::Number(50.));
    wb.set_cell(0, "B2", Value::Number(80.));
    hits.set(0);
    history.undo(&mut wb).unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Report", "A1"), Value::Number(80.));
    history.redo(&mut wb).unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Report", "A1"), Value::Number(110.));
    wb.sheet_mut(other).unwrap().unsubscribe_cell(subscription);
}

#[test]
fn headerless_resize_keeps_the_first_data_row_and_grid_overflow_is_atomic() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B2", Value::Number(42.));
    wb.set_cell(0, "C2", Value::Number(64.));
    wb.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts(
            "Inventory",
            "Sheet1",
            range("B2", "B4"),
            false,
            false,
            vec!["Amount".into()],
        ),
    ]))
    .unwrap();
    let mut history = WorkbookHistory::default();
    history
        .resize_table(&mut wb, "Inventory", range("B2", "C4"))
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(64.));
    assert_eq!(
        wb.get_table("Inventory").unwrap().columns(),
        &["Amount", "Column1"]
    );
    let oversized = CellRange::new(CellAddress::new(1, 1), CellAddress::new(1_048_576, 2));
    assert!(history
        .resize_table(&mut wb, "Inventory", oversized)
        .is_err());
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(42.));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(64.));
}

#[test]
fn header_conflict_rejects_undo_before_any_registry_or_formula_write() {
    let (mut wb, mut history) = seed();
    wb.sheet_mut(0).unwrap().set_format(
        "D1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    history
        .resize_table(&mut wb, "Inventory", range("A1", "D3"))
        .unwrap();
    wb.set_cell(0, "D1", Value::Text("External".into()));
    let before = wb.get_table("Inventory").unwrap().clone();
    let epoch = wb.tables_epoch();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.get_table("Inventory"), Some(&before));
    assert_eq!(wb.tables_epoch(), epoch);
    assert!(wb.sheet(0).unwrap().get_format("D1").bold);
    wb.set_cell(0, "D1", Value::Text("Column1".into()));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Null);
    assert!(wb.sheet(0).unwrap().get_format("D1").bold);
}
