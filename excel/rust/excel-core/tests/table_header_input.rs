//! 直接编辑表头与面板改名走同一原子操作，普通输入不改变解释或撤销语义。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.define_table(
        Some("Inventory"),
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
        true,
    )
    .unwrap();
    assert!(wb.set_formula(0, "C1", "=SUM(Inventory[Amount])"));
    (wb, WorkbookHistory::default())
}

#[test]
fn header_edits_rename_consumers_and_restore_the_original_in_one_undo() {
    let (mut wb, mut history) = seed();
    history.set_cell_input(&mut wb, 0, "A1", "Revenue").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Revenue".into()));
    assert_eq!(wb.get_table("Inventory").unwrap().columns(), &["Revenue"]);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Amount".into()));
    assert_eq!(
        wb.sheet(0)
            .unwrap()
            .formula_text_at(CellAddress::new(0, 2))
            .as_deref(),
        Some("=SUM(Inventory[Amount])")
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Revenue".into()));
}

#[test]
fn headers_remain_text_and_use_the_same_name_validation_as_the_panel() {
    for input in ["2026", "12%", "TRUE", "=1+1", "'00123", "净额 [税] #@"] {
        let (mut wb, mut history) = seed();
        history.set_cell_input(&mut wb, 0, "A1", input).unwrap();
        let expected = input.strip_prefix('\'').unwrap_or(input);
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(expected.into()));
        assert_eq!(wb.get_table("Inventory").unwrap().columns()[0], expected);
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_table("Inventory").unwrap().columns()[0], "Amount");
        assert!(history.set_cell_input(&mut wb, 0, "A1", " ").is_err());
        assert_eq!(history.redo_count(), 1);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(expected.into()));
    }
}

#[test]
fn body_input_keeps_numeric_formula_and_failed_input_history_semantics() {
    let (mut wb, mut history) = seed();
    history.set_cell_input(&mut wb, 0, "A2", "40").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(40.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(40.0));
    history.set_cell_input(&mut wb, 0, "A3", "=A2*2").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(120.0));
    assert_eq!(history.undo_count(), 2);
    history.undo(&mut wb).unwrap();
    assert!(history.set_cell_input(&mut wb, 0, "A3", "=SUM(").is_err());
    assert_eq!(history.redo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(40.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(120.0));
    assert_eq!(wb.get_table("Inventory").unwrap().columns(), &["Amount"]);
}

#[test]
fn input_rejects_a_pending_history_command_without_consuming_it() {
    let (mut wb, mut history) = seed();
    history
        .begin(
            &wb,
            0,
            CellRange::single(CellAddress::new(1, 0)),
            "Pending",
            true,
        )
        .unwrap();
    assert!(history.set_cell_input(&mut wb, 0, "A1", "Revenue").is_err());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Amount".into()));
    history.finish(&mut wb, true).unwrap();
    history.set_cell_input(&mut wb, 0, "A1", "Revenue").unwrap();
    assert_eq!(history.undo_count(), 1);
}
