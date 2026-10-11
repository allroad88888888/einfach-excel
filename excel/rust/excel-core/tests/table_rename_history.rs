//! Table 改名是一条原生历史；结构化引用、裸名称与词法局部名不能混淆。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.define_table(Some("Inventory"), 0, range("A1", "A3"), true)
        .unwrap();
    wb
}
fn source(wb: &Workbook, sheet: usize, address: &str) -> String {
    wb.sheet(sheet)
        .unwrap()
        .formula_text_at(CellAddress::parse(address).unwrap())
        .unwrap()
}

#[test]
fn rename_updates_both_reference_forms_and_undo_restores_exact_source() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    let formulas = [
        (0, "C1", "= SUM(Inventory[Amount]) + SUM(inventory) ", 60.0),
        (other, "C1", "=LET(Stock,7,SUM(Inventory)+Stock)", 37.0),
        (
            other,
            "C2",
            "=LET(Inventory,7,Inventory+SUM(Inventory[Amount]))",
            37.0,
        ),
        (other, "C3", "=LAMBDA(Stock,SUM(Inventory)+Stock)(8)", 38.0),
        (other, "C4", "=LAMBDA(Inventory,Inventory+1)(8)", 9.0),
        (
            other,
            "C5",
            "=IF(\"Inventory\"=\"Stock\",0,SUM(Inventory))",
            30.0,
        ),
    ];
    for (sheet, addr, formula, _) in formulas {
        assert!(wb.set_formula(sheet, addr, formula));
    }
    let originals: Vec<_> = formulas
        .iter()
        .map(|(sheet, addr, _, _)| source(&wb, *sheet, addr))
        .collect();
    let mut history = WorkbookHistory::default();
    assert!(history.rename_table(&mut wb, "inventory", "Stock").unwrap());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    assert!(source(&wb, 0, "C1").contains("Stock[Amount]"));
    assert_eq!(source(&wb, other, "C4"), originals[4]);
    wb.define_table(Some("Unrelated"), 0, range("F1", "F3"), true)
        .unwrap();
    for _ in 0..3 {
        for (sheet, addr, _, expected) in formulas {
            assert_eq!(
                wb.get_cell(wb.name(sheet).unwrap(), addr),
                Value::Number(expected),
                "{addr}"
            );
        }
        history.undo(&mut wb).unwrap();
        assert!(wb.get_table("Inventory").is_some());
        assert!(wb.get_table("Unrelated").is_some());
        for ((sheet, addr, _, expected), original) in formulas.iter().zip(&originals) {
            assert_eq!(&source(&wb, *sheet, addr), original);
            assert_eq!(
                wb.get_cell(wb.name(*sheet).unwrap(), addr),
                Value::Number(*expected)
            );
        }
        history.redo(&mut wb).unwrap();
    }
}

#[test]
fn case_only_rename_and_noop_have_distinct_history_semantics() {
    let mut wb = seed();
    wb.set_formula(0, "C1", "=SUM(Inventory)");
    let mut history = WorkbookHistory::default();
    assert!(history
        .rename_table(&mut wb, "Inventory", "inventory")
        .unwrap());
    assert_eq!(wb.get_table("Inventory").unwrap().name(), "inventory");
    assert!(source(&wb, 0, "C1").contains("inventory"));
    history.undo(&mut wb).unwrap();
    assert!(!history
        .rename_table(&mut wb, "inventory", "Inventory")
        .unwrap());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
}

#[test]
fn invalid_rename_does_not_mutate_or_consume_redo() {
    let mut wb = seed();
    wb.define_name_value("Taken", Value::Number(1.0)).unwrap();
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    history.undo(&mut wb).unwrap();
    for name in ["Taken", "SUM", "A1", "bad name", ""] {
        assert!(history.rename_table(&mut wb, "Inventory", name).is_err());
        assert!(wb.get_table("Inventory").is_some());
        assert_eq!(history.redo_count(), 1);
    }
    assert!(history.rename_table(&mut wb, "Missing", "Stock").is_err());
    history
        .begin(&wb, 0, range("C1", "C1"), "Pending", true)
        .unwrap();
    assert!(history.rename_table(&mut wb, "Inventory", "Stock").is_err());
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn external_formula_or_registry_changes_reject_undo_before_any_write() {
    let mut wb = seed();
    wb.set_formula(0, "C1", "=SUM(Inventory)");
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    assert!(history.undo(&mut seed()).is_err());
    wb.set_formula(0, "C1", "=99");
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Stock").is_some());
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(99.0));
    wb.set_formula(0, "C1", "=SUM(Stock)");
    wb.define_name_value("Inventory", Value::Number(7.0))
        .unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn array_references_and_indirect_spill_consumers_survive_rename_history() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    wb.set_formula(0, "C1", "=Inventory[Amount]");
    wb.set_formula(other, "A1", "=Inventory");
    wb.set_formula(other, "D1", "=Sheet1!C1#");
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    for _ in 0..3 {
        for (sheet, addr) in [("Sheet1", "C2"), ("Other", "A2"), ("Other", "D2")] {
            assert_eq!(
                wb.get_cell(sheet, addr),
                Value::Number(20.0),
                "{sheet}!{addr}"
            );
        }
        history.undo(&mut wb).unwrap();
        assert_eq!(source(&wb, 0, "C1"), "=Inventory[Amount]");
        assert_eq!(wb.get_cell("Other", "D2"), Value::Number(20.0));
        history.redo(&mut wb).unwrap();
    }
}

#[test]
fn rename_revives_preexisting_new_name_consumers_with_one_notification() {
    use std::{cell::Cell, rc::Rc};
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    wb.set_formula(other, "C1", "=SUM(Stock)");
    wb.set_formula(other, "D1", "=Stock[Amount]");
    wb.set_formula(0, "C1", "=SUM(Inventory)");
    let hits = Rc::new(Cell::new(0));
    let seen = hits.clone();
    let subscription = wb
        .sheet_mut(other)
        .unwrap()
        .subscribe_cell("C1", move || seen.set(seen.get() + 1));
    hits.set(0);
    let mut history = WorkbookHistory::default();
    history.rename_table(&mut wb, "Inventory", "Stock").unwrap();
    for _ in 0..3 {
        assert_eq!(hits.replace(0), 1);
        assert_eq!(wb.get_cell("Other", "C1"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Other", "D2"), Value::Number(20.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(hits.replace(0), 1);
        assert_eq!(
            wb.get_cell("Other", "C1"),
            Value::Error(ValueError::InvalidName)
        );
        assert_eq!(wb.get_cell("Other", "D2"), Value::Null);
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
        history.redo(&mut wb).unwrap();
    }
    wb.sheet_mut(other).unwrap().unsubscribe_cell(subscription);
}
