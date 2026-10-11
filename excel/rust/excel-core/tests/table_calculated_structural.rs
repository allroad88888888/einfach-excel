//! 计算列定义随本表行列插删：列身份、公式原点与真实引用共同移动。
use einfach_core::{Value, ValueError};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableRegistrySnapshot, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed(formula: &str) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Total".into()));
    for (addr, value) in [("A2", 10.), ("A3", 20.), ("A4", 30.), ("D1", 5.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B3", formula).unwrap();
    history.clear("");
    (book, history)
}

#[test]
fn inserting_rows_before_table_moves_origin_and_both_local_and_qualified_refs() {
    let (mut book, mut history) = seed("=A3+Sheet1!A3+$D$1");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 2 }).unwrap();
    let after = book.snapshot_tables();
    let formula = book.get_table("Orders").unwrap().calculated_columns()[1].as_ref().unwrap();
    assert_eq!(formula.row(), 4);
    assert_eq!(formula.formula(), "=((A5+Sheet1!A5)+$D$3)");
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), after);
    }
    history.set_cell_input(&mut book, 0, "A7", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(85.));
}

#[test]
fn deleting_origin_uses_surviving_template_row_instead_of_ref_error() {
    let (mut book, mut history) = seed("=A3*2");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 2, count: 1 }).unwrap();
    let formula = book.get_table("Orders").unwrap().calculated_columns()[1].as_ref().unwrap();
    assert_eq!(formula.row(), 1);
    assert_eq!(formula.formula(), "=(A2*2)");
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(60.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A4", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(80.));
    history.set_cell_input(&mut book, 0, "B2", "=A2*3").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(90.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(120.));
}

#[test]
fn deleting_first_data_and_origin_uses_a_surviving_later_row() {
    let (mut book, mut history) = seed("=A3*2");
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1, count: 2 }).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(60.));
    history.set_cell_input(&mut book, 0, "A3", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(80.));
}

#[test]
fn deleting_all_data_keeps_standard_formula_for_the_next_record() {
    let (mut book, mut history) = seed("=A3*2");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1, count: 3 }).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B1"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A2", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(80.));
}

#[test]
fn column_insert_keeps_calculated_identity_and_new_column_has_no_template() {
    let (mut book, mut history) = seed("=A3+$D$1");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::ColInsert { at: 1, count: 1 }).unwrap();
    let definitions = book.get_table("Orders").unwrap().calculated_columns();
    assert_eq!(definitions.len(), 3);
    assert!(definitions[0].is_none() && definitions[1].is_none());
    assert_eq!(definitions[2].as_ref().unwrap().formula(), "=(A3+$E$1)");
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C5"), Value::Number(45.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn deleting_calculated_column_drops_its_template_without_assigning_it_to_another_column() {
    let (mut book, mut history) = seed("=A3*2");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 1, count: 1 }).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().calculated_columns(), [None]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn unchanged_table_geometry_still_rewrites_references_to_outside_deleted_columns() {
    let (mut book, mut history) = seed("=A3+$D$1");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 3, count: 1 }).unwrap();
    let table = book.get_table("Orders").unwrap();
    assert_eq!(table.range(), range("A1", "B4"));
    assert!(table.calculated_columns()[1].as_ref().unwrap().formula().contains("#REF!"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn deleting_header_removes_template_and_undo_restores_it() {
    let (mut book, mut history) = seed("=A3*2");
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 0, count: 1 }).unwrap();
    assert!(book.get_table("Orders").is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(80.));
}

#[test]
fn origin_outside_a_shrunk_table_rebases_before_insertion_pushes_it_out_of_grid() {
    let (mut book, mut history) = seed("=A3*2");
    let table = book.get_table("Orders").unwrap().clone().with_calculated_columns(vec![
        None, Some(TableColumnFormula::new(1_048_575, "=A1048576*2").unwrap()),
    ]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 4, count: 1 }).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().calculated_columns()[1].as_ref().unwrap().row(), 1);
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(80.));
}

#[test]
fn removing_last_grid_row_keeps_template_for_recreating_that_record() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1048575", Value::Text("Amount".into()));
    book.set_cell(0, "B1048575", Value::Text("Total".into()));
    book.set_cell(0, "A1048576", Value::Number(10.));
    book.define_table(Some("Orders"), 0, range("A1048575", "B1048576"), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B1048576", "=A1048576*2").unwrap();
    let before = book.snapshot_tables();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1_048_575, count: 1 }).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A1048576", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1048576"), Value::Number(80.));
}

#[test]
fn replacement_origin_does_not_turn_a_valid_relative_reference_into_permanent_ref_error() {
    for (source, target, value) in [("=A1", "A3", 30.), ("=D1048576", "D1048576", 7.)] {
        let (mut book, mut history) = seed(source);
        history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 2, count: 1 }).unwrap();
        book.set_cell(0, target, Value::Number(value));
        history.set_cell_input(&mut book, 0, "A4", "40").unwrap();
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(value), "{source}");
    }
}
