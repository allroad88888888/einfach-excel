//! Table 内结构插行的公式继承必须跟整次位移共同提交、共同撤销。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use std::{cell::Cell, rc::Rc};
#[path = "support/conditional_format_rule.rs"]
mod rules;
use rules::range;
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Total".into()));
    for (addr, value) in [("A2", 1.), ("A3", 2.), ("A4", 3.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*2").unwrap();
    history.clear("");
    (book, history)
}
fn observe(book: &mut Workbook) -> Rc<Cell<u32>> {
    let report = book.add_sheet("Report");
    book.set_formula(report, "A1", "=Orders[#All]");
    book.set_formula(report, "E1", "=SUM(A1#)");
    let calls = Rc::new(Cell::new(0));
    let counter = calls.clone();
    book.sheet_mut(report).unwrap().subscribe_cell("E1", move || counter.set(counter.get() + 1));
    calls.set(0);
    calls
}

#[test]
fn inserting_multiple_rows_preserves_exceptions_and_publishes_one_final_history_step() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=IF([@Amount]=0,5,[@Amount]*2)").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "99").unwrap();
    history.clear("");
    let before = book.snapshot_tables();
    let calls = observe(&mut book);
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 2 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(5.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(5.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(4.));
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B6"));
    assert_eq!(history.undo_count(), 1);
    assert_eq!(calls.replace(0), 1);
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(4.));
        assert_eq!(calls.replace(0), 1);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(5.));
        assert_eq!(calls.replace(0), 1);
    }
}

#[test]
fn first_data_row_insertion_uses_shifted_template_origin_and_mixed_references() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "F1", Value::Number(7.));
    history.set_cell_input(&mut book, 0, "B2", "=A2+$F$1").unwrap();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 2 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(8.));
    history.undo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(7.));
}

#[test]
fn insertion_before_totals_inherits_without_replacing_the_moved_total() {
    let (mut book, mut history) = seed();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    history.clear("");
    let total = book.sheet(0).unwrap().get_formula("B5");
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 4, count: 1 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(0.));
    assert_eq!(book.sheet(0).unwrap().get_formula("B6"), total);
    assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(12.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_formula("B5"), total);
    history.redo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().get_formula("B5").is_some());
}

#[test]
fn inserting_above_header_or_after_table_does_not_fill_unowned_rows() {
    for at in [0, 4] {
        let (mut book, mut history) = seed();
        history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at, count: 1 }).unwrap();
        assert_eq!(book.get_cell("Sheet1", &format!("B{}", at + 1)), Value::Null);
    }
}

#[test]
fn rejected_inherited_value_restores_structure_and_suppresses_transient_callbacks() {
    let (mut book, mut history) = seed();
    book.set_conditional_format_rule(0, 0, rules::rule("r", range("B2", "B4"), "gt", "0")).unwrap();
    let old_rules = book.conditional_format_config(0).unwrap().rules;
    book.sheet_mut(0).unwrap().set_data_validation(range("B2", "B4"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 1., max: 10. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    let calls = observe(&mut book);
    assert_eq!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 })
        .unwrap_err(), "DATA_VALIDATION_FAILED");
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(4.));
    assert_eq!(history.redo_count(), 1);
    assert_eq!(calls.get(), 0);
    assert_eq!(book.conditional_format_config(0).unwrap().rules, old_rules);
}

#[test]
fn raw_workbook_entry_also_inherits_and_rolls_back_failed_arrays() {
    let (mut book, mut history) = seed();
    book.try_structural_edit(0, ShiftEdit::RowInsert { at: 2, count: 1 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(0.));
    // 换回干净工作簿，旧记录中没有数组，只有新空行会触发数组分支。
    let (mut other, _) = seed();
    history.clear("");
    history.set_cell_input(&mut other, 0, "B2", "=IF(A2=0,SEQUENCE(2),A2*2)").unwrap();
    let before = other.snapshot_tables();
    assert!(other.try_structural_edit(0, ShiftEdit::RowInsert { at: 2, count: 1 }).is_err());
    assert_eq!(other.snapshot_tables(), before);
    assert_eq!(other.get_cell("Sheet1", "B3"), Value::Number(4.));
    assert_eq!(other.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn all_tables_in_the_inserted_band_receive_formulas_before_final_validation() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "D1", Value::Text("Other".into()));
    book.set_cell(0, "E1", Value::Text("Value".into()));
    book.define_table(Some("Rates"), 0, range("D1", "E4"), true).unwrap();
    history.set_cell_input(&mut book, 0, "E2", "=10").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "=IF(E2=0,SEQUENCE(2),E2+1)").unwrap();
    history.clear("");
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(11.));
    assert_eq!(book.get_cell("Sheet1", "E3"), Value::Number(10.));
    history.undo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(11.));
}

#[test]
fn excessive_insert_inheritance_rejects_before_shifting_any_sheet_data() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 500_000 })
        .unwrap_err().contains("32 MiB"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn last_rule_revision_is_reserved_for_rollback_before_any_structural_write() {
    let (mut book, mut history) = seed();
    book.set_conditional_format_rule(0, 0, rules::rule("r", range("B2", "B4"), "gt", "0")).unwrap();
    let mut rules = book.snapshot_conditional_formats();
    rules[0].revision = u64::MAX - 1;
    book.restore_conditional_formats(rules.clone()).unwrap();
    let tables = book.snapshot_tables();
    assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 }).is_err());
    assert_eq!(book.snapshot_conditional_formats(), rules);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
}

#[test]
fn existing_calculated_formula_cannot_start_spilling_after_its_row_moves() {
    for source in ["=IF(ROW()>4,SEQUENCE(2),1)", "=IF(ROW()>4,SEQUENCE(1,2),1)"] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "B2", source).unwrap();
        book.set_cell(0, "C4", Value::Number(99.)); // 横向数组移动后仍被现有数据阻挡。
        let before = book.snapshot_tables();
        history.clear("");
        assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 }).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(1.));
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(99.));
        assert_eq!(history.undo_count(), 0);
    }
}
