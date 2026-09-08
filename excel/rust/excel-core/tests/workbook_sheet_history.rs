use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn input(history: &mut WorkbookHistory, wb: &mut Workbook, sheet: usize, value: &str) {
    let a1 = CellAddress::new(0, 0);
    history
        .begin(wb, sheet, CellRange::new(a1, a1), "Edit cell", true)
        .unwrap();
    wb.set_cell_input(sheet, "A1", value).unwrap();
    history.finish(wb, true).unwrap();
}

#[test]
fn rename_restores_exact_sources_without_retargeting_preexisting_dangling_references() {
    let mut wb = Workbook::new();
    wb.add_sheet("Summary");
    wb.set_cell_input(0, "A1", "7").unwrap();
    wb.set_formula(1, "A1", "=  Sheet1!A1 * 2");
    wb.set_formula(1, "B1", "=Renamed!A1");
    let mut history = WorkbookHistory::default();
    let key = wb.sheet_key(0);
    history.edit_sheet(&mut wb, Some(0), "Renamed").unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.get_cell("Summary", "B1"), Value::Number(7.0));
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet_key(0), key);
        assert_eq!(
            wb.sheet(1).unwrap().get_formula("A1").as_deref(),
            Some("=  Sheet1!A1 * 2")
        );
        assert_eq!(
            wb.sheet(1).unwrap().get_formula("B1").as_deref(),
            Some("=Renamed!A1")
        );
        assert!(matches!(wb.get_cell("Summary", "B1"), Value::Error(_)));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(14.0));
        assert_eq!(wb.get_cell("Summary", "B1"), Value::Number(7.0));
    }
}

#[test]
fn cells_rename_move_and_delete_share_one_lifo_history() {
    let mut wb = Workbook::new();
    wb.add_sheet("Summary");
    wb.set_formula(1, "A1", "=Sheet1!A1*2");
    let key = wb.sheet_key(0);
    let mut history = WorkbookHistory::default();
    input(&mut history, &mut wb, 0, "7");
    history.edit_sheet(&mut wb, Some(0), "Orders").unwrap();
    history.move_sheet(&mut wb, 0, 1).unwrap();
    input(&mut history, &mut wb, 1, "9");
    history.remove_sheet(&mut wb, 1).unwrap();
    assert_eq!(history.undo_count(), 5);
    assert!(matches!(wb.get_cell("Summary", "A1"), Value::Error(_)));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_key(1), key);
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(18.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(14.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_key(0), key);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.name(0), Some("Sheet1"));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    for _ in 0..5 {
        assert!(history.redo(&mut wb).unwrap());
    }
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(wb.name(0), Some("Summary"));
    assert_eq!(history.undo_count(), 5);
}

#[test]
fn undo_add_keeps_missing_sheet_formula_source_and_redo_reuses_identity() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=New!A1");
    let mut history = WorkbookHistory::default();
    let added = history.edit_sheet(&mut wb, None, "New").unwrap();
    let key = wb.sheet_key(added);
    input(&mut history, &mut wb, added, "42");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
    history.undo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=New!A1")
    );
    assert!(matches!(wb.get_cell("Sheet1", "A1"), Value::Error(_)));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet_key(1), key);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
}

#[test]
fn failed_and_noop_structure_commands_preserve_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut wb, None, "Second").unwrap();
    history.undo(&mut wb).unwrap();
    assert!(history.edit_sheet(&mut wb, None, "History").is_err());
    assert!(history.remove_sheet(&mut wb, 0).is_err());
    assert!(history.move_sheet(&mut wb, 0, 2).is_err());
    history.move_sheet(&mut wb, 0, 0).unwrap();
    history.edit_sheet(&mut wb, Some(0), " Sheet1 ").unwrap();
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.name(1), Some("Second"));
}

#[test]
fn failed_restore_preserves_cursor_and_archive_for_retry() {
    let mut wb = Workbook::new();
    wb.add_sheet("Second");
    wb.set_cell_input(1, "A1", "123").unwrap();
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut wb, 1).unwrap();
    wb.add_sheet("Collision"); // 未经历史的外部结构操作。
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(history.undo_count(), 1);
    wb.remove_sheet(1).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Second", "A1"), Value::Number(123.0));
}

#[test]
fn native_history_cannot_restore_into_another_workbook() {
    let mut wb = Workbook::new();
    let mut other = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut wb, None, "Second").unwrap();
    other.add_sheet("Second");
    assert!(history.undo(&mut other).is_err());
    assert_eq!(other.sheet_count(), 2);
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).unwrap());
}

#[test]
fn archived_sheet_participates_in_existing_memory_budget() {
    let mut wb = Workbook::new();
    wb.add_sheet("Large");
    wb.set_cell(1, "A1", Value::Text("x".repeat(33 * 1024 * 1024)));
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut wb, Some(0), "Small").unwrap();
    history.remove_sheet(&mut wb, 1).unwrap();
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 0);
    assert!(history.notice().unwrap().contains("dropped"));
}

#[test]
fn structure_commands_reject_while_a_cell_transaction_is_pending() {
    let mut wb = Workbook::new();
    wb.add_sheet("Second");
    let mut history = WorkbookHistory::default();
    let a1 = CellAddress::new(0, 0);
    history
        .begin(&wb, 0, CellRange::new(a1, a1), "Input", true)
        .unwrap();
    assert!(history.edit_sheet(&mut wb, Some(0), "Renamed").is_err());
    assert!(history.remove_sheet(&mut wb, 0).is_err());
    assert!(history.move_sheet(&mut wb, 0, 1).is_err());
    history.finish(&mut wb, false).unwrap();
    assert_eq!(history.undo_count(), 0);
    assert_eq!(wb.name(0), Some("Sheet1"));
}

#[test]
fn archive_budget_does_not_evaluate_lazy_or_spilling_formulas() {
    let mut wb = Workbook::new();
    wb.add_sheet("Lazy");
    wb.sheet_mut(1).unwrap().bulk_load(|loader| {
        loader.set_formula("A1", "=SEQUENCE(100)");
        loader.set_formula("B1", "=1+2");
    });
    let count = wb.sheet(1).unwrap().debug_formula_eval_count();
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut wb, 1).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(1).unwrap().debug_formula_eval_count(), count);
    assert_eq!(wb.get_cell("Lazy", "B1"), Value::Number(3.0));
    assert!(matches!(wb.get_cell("Lazy", "A1"), Value::Array(_)));
    // bulk_load 的惰性数组尚未安装 spill 子格；用普通写入口创建实际 spill 再验证归档。
    wb.set_formula(1, "C1", "=SEQUENCE(100)");
    assert_eq!(wb.get_cell("Lazy", "C100"), Value::Number(100.0));
    let evaluated = wb.sheet(1).unwrap().debug_formula_eval_count();
    history.redo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(1).unwrap().debug_formula_eval_count(), evaluated);
    assert_eq!(wb.get_cell("Lazy", "C100"), Value::Number(100.0));
}

#[test]
fn cell_history_rejects_same_named_replacement_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Second");
    let mut history = WorkbookHistory::default();
    input(&mut history, &mut wb, 1, "7");
    let key = wb.sheet_key(1).unwrap();
    let entry = history.entries().next().unwrap();
    assert!(!entry.is_sheet_change());
    assert_eq!(entry.sheet_key, key);
    assert_eq!(entry.affected_keys, vec![key]);
    wb.remove_sheet(1).unwrap();
    wb.add_sheet("Second");
    wb.set_cell_input(1, "A1", "99").unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.get_cell("Second", "A1"), Value::Number(99.0));
}
