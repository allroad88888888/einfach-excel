//! 跨表结构变化只保存实际改变的模板；即使数据区全为手工例外也要能回放。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableRegistrySnapshot, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Number(5.));
    book.add_sheet("Report");
    book.set_cell(1, "A1", Value::Text("Amount".into()));
    book.set_cell(1, "B1", Value::Text("Total".into()));
    book.set_cell(1, "A2", Value::Number(10.));
    book.set_cell(1, "A3", Value::Number(20.));
    book.define_table(Some("Orders"), 1, range("A1", "B3"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 1, "B2", "=IFERROR(Sheet1!$A$2,99)+[@Amount]").unwrap();
    history.clear("");
    (book, history)
}

#[test]
fn all_four_cross_sheet_edits_restore_templates_and_later_inheritance() {
    for (edit, expected) in [
        (ShiftEdit::RowInsert { at: 0, count: 2 }, 35.),
        (ShiftEdit::RowDelete { at: 1, count: 1 }, 129.),
        (ShiftEdit::ColInsert { at: 0, count: 1 }, 35.),
        (ShiftEdit::ColDelete { at: 0, count: 1 }, 129.),
    ] {
        let (mut book, mut history) = seed();
        let before = book.snapshot_tables();
        history.edit_structure(&mut book, 0, edit).unwrap();
        let after = book.snapshot_tables();
        assert_ne!(before, after);
        assert_eq!(history.entries().next().unwrap().affected_sheets(), [0, 1]);
        for _ in 0..2 {
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), before);
            history.redo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), after);
        }
        history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
        assert_eq!(book.get_cell("Report", "B4"), Value::Number(expected));
    }
}

#[test]
fn template_only_consumer_is_in_history_even_when_no_cell_formula_remains() {
    let (mut book, mut history) = seed();
    book.set_cell(1, "B2", Value::Number(111.));
    book.set_cell(1, "B3", Value::Number(222.));
    book.set_formula(1, "D5", "=SEQUENCE(3)");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    assert_eq!(history.entries().next().unwrap().affected_sheets(), [0, 1]);
    let evaluations = book.debug_formula_eval_count(1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.debug_formula_eval_count(1), evaluations);
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Report", "B2"), Value::Number(111.));
    assert_eq!(book.get_cell("Report", "B3"), Value::Number(222.));
    assert_eq!(book.get_cell("Report", "D7"), Value::Number(3.));
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(35.));
}

#[test]
fn external_template_edit_rejects_structural_undo_before_moving_cells() {
    let (mut book, mut history) = seed();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    let valid = book.snapshot_tables();
    let table = book.get_table("Orders").unwrap().clone().with_calculated_columns(vec![
        None, Some(TableColumnFormula::new(1, "=99").unwrap()),
    ]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(5.));
    assert_eq!(history.undo_count(), 1);
    book.restore_tables(valid).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(5.));
}

#[test]
fn unchanged_external_template_is_not_overwritten_by_structural_undo() {
    let (mut book, mut history) = seed();
    // 第二张 Table 不引用来源表；不能为了保存其它模板而复制整份注册表。
    book.define_table(Some("Unrelated"), 1, range("D1", "E3"), true).unwrap();
    history.set_cell_input(&mut book, 1, "E2", "=7").unwrap();
    history.clear("");
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    let changed = book.get_table("Unrelated").unwrap().clone().with_calculated_columns(vec![
        None, Some(TableColumnFormula::new(1, "=8").unwrap()),
    ]);
    let orders = book.get_table("Orders").unwrap().clone();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![orders, changed.clone()])).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Unrelated"), Some(&changed));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_table("Unrelated"), Some(&changed));
}
