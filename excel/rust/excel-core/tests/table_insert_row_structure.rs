//! 空表跟随结构插删：待输入标记、计算列、汇总与原生历史必须一致。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableEntry, TableRegistrySnapshot, Workbook};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed(totals: bool, formula: Option<&str>) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A3", Value::Text("Qty".into()));
    book.set_cell(0, "B3", Value::Text("Amount".into()));
    if totals { book.set_cell(0, "B5", Value::Number(99.)); }
    let mut table = TableEntry::from_parts("Orders", "Sheet1", range("A3", if totals { "B5" } else { "B4" }),
        true, totals, vec!["Qty".into(), "Amount".into()]).with_insert_row(true);
    if let Some(source) = formula {
        table = table.with_calculated_columns(vec![None, Some(TableColumnFormula::new(3, source).unwrap())]);
    }
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=ROWS(Orders[Qty])");
    (book, WorkbookHistory::default())
}
fn assert_restorable(book: &Workbook) {
    let mut restored = Workbook::new();
    restored.restore_tables(book.snapshot_tables()).unwrap();
    assert_eq!(restored.snapshot_tables(), book.snapshot_tables());
}

#[test]
fn shifting_the_table_or_inserting_columns_preserves_zero_records() {
    for edit in [ShiftEdit::RowInsert { at: 0, count: 2 },
        ShiftEdit::RowDelete { at: 0, count: 1 }, ShiftEdit::ColInsert { at: 1, count: 1 },
        ShiftEdit::ColDelete { at: 1, count: 1 }] {
        let (mut book, mut history) = seed(true, Some("=A4*2"));
        let before = book.snapshot_tables();
        history.edit_structure(&mut book, 0, edit).unwrap();
        let after = book.snapshot_tables();
        assert!(book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), after);
    }
}

#[test]
fn inserted_records_include_the_former_input_row_and_one_repeatable_history() {
    for formula in [None, Some("=A4*2")] {
        for at in [3, 4] {
            let (mut book, mut history) = seed(true, formula);
            let before = book.snapshot_tables();
            history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at, count: 2 }).unwrap();
            assert!(!book.get_table("Orders").unwrap().has_insert_row());
            assert_eq!(book.get_cell("Report", "A1"), Value::Number(3.));
            for addr in ["B4", "B5", "B6"] {
                assert_eq!(book.get_cell("Sheet1", addr), if formula.is_some() { Value::Number(0.) } else { Value::Null });
            }
            assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(99.));
            assert_restorable(&book);
            let after = book.snapshot_tables();
            assert_eq!(history.undo_count(), 1);
            for _ in 0..2 {
                history.undo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), before);
                assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
                assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
                assert_eq!(book.get_cell("Sheet1", "B6"), Value::Null);
                history.redo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), after);
                if formula.is_some() { assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.)); }
            }
        }
    }
}

#[test]
fn deleting_the_input_row_leaves_valid_headers_or_headers_with_totals() {
    for totals in [false, true] {
        let (mut book, mut history) = seed(totals, Some("=A4*2"));
        let before = book.snapshot_tables();
        history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 3, count: 1 }).unwrap();
        let table = book.get_table("Orders").unwrap();
        assert!(!table.has_insert_row());
        assert_eq!(table.range(), range("A3", if totals { "B4" } else { "B3" }));
        assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        if !totals {
            history.set_cell_input(&mut book, 0, "A4", "7").unwrap();
            assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(14.));
        }
    }
}

#[test]
fn deleting_totals_never_reclassifies_the_previous_row_as_totals() {
    for populated in [false, true] {
        let (mut book, mut history) = seed(true, Some("=A4*2"));
        if populated { history.set_cell_input(&mut book, 0, "A4", "7").unwrap(); }
        history.clear("");
        let before = book.snapshot_tables();
        history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 4, count: 1 }).unwrap();
        let table = book.get_table("Orders").unwrap();
        assert!(!table.has_totals());
        assert_eq!(table.has_insert_row(), !populated);
        assert_eq!(book.get_cell("Report", "A1"), if populated { Value::Number(1.) } else { Value::Error(ValueError::InvalidRef) });
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
    }
}

#[test]
fn failed_inheritance_restores_cells_above_the_shift_band_and_preserves_redo() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    use std::{cell::Cell, rc::Rc};
    for at in [3, 4] {
        let (mut book, mut history) = seed(true, Some("=A4*2"));
        book.sheet_mut(0).unwrap().set_data_validation(range("B4", "B4"), Some(DataValidationRule {
            options: Default::default(), kind: DataValidationKind::WholeNumber { min: 1., max: 10. },
            ignore_blank: true, operator: Default::default(),
        })).unwrap();
        history.set_cell_input(&mut book, 0, "F1", "9").unwrap();
        history.undo(&mut book).unwrap();
        let before = book.snapshot_tables();
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        book.sheet_mut(1).unwrap().subscribe_cell("A1", move || observed.set(observed.get() + 1));
        calls.set(0);
        assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at, count: 2 }).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Null);
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
        assert_eq!(calls.get(), 0);
        assert!(book.try_structural_edit(0, ShiftEdit::RowInsert { at, count: 2 }).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    }
}

#[test]
fn array_inheritance_is_rejected_without_losing_the_empty_table() {
    let (mut book, mut history) = seed(true, Some("=SEQUENCE(2)"));
    let before = book.snapshot_tables();
    assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 4, count: 1 }).is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn arrays_depending_on_the_old_input_row_reproject_once_per_history_step() {
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut history) = seed(true, Some("=A4*2"));
    book.set_formula(1, "B1", "=IF(ISNUMBER(Sheet1!B4),SEQUENCE(2),SEQUENCE(3))");
    book.set_formula(1, "C1", "=SUM(B1#)");
    assert_eq!(book.get_cell("Report", "C1"), Value::Number(6.));
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    book.sheet_mut(1).unwrap().subscribe_cell("C1", move || observed.set(observed.get() + 1));
    calls.set(0);
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 4, count: 1 }).unwrap();
    assert_eq!(book.get_cell("Report", "C1"), Value::Number(3.));
    assert_eq!(book.get_cell("Report", "B3"), Value::Null);
    assert_eq!(calls.replace(0), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Report", "C1"), Value::Number(6.));
    assert_eq!(book.get_cell("Report", "B3"), Value::Number(3.));
    assert_eq!(calls.replace(0), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Report", "C1"), Value::Number(3.));
    assert_eq!(calls.get(), 1);
}

#[test]
fn headerless_tables_can_gain_records_or_disappear_without_invalid_empty_metadata() {
    for totals in [false, true] {
        let (mut book, mut history) = seed(totals, None);
        let table = TableEntry::from_parts("Orders", "Sheet1", range("A4", if totals { "B5" } else { "B4" }),
            false, totals, vec!["Qty".into(), "Amount".into()]).with_insert_row(true)
            .with_calculated_columns(vec![None, Some(TableColumnFormula::new(3, "=A4*2").unwrap())]);
        book.restore_tables(TableRegistrySnapshot::from_entries(vec![table])).unwrap();
        let before = book.snapshot_tables();
        let edit = ShiftEdit::RowInsert { at: if totals { 4 } else { 3 }, count: 1 };
        history.edit_structure(&mut book, 0, edit).unwrap();
        assert_eq!(book.get_table("Orders").unwrap().has_insert_row(), !totals);
        if totals {
            assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.));
            assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(0.));
            assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(99.));
        }
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 3, count: 1 }).unwrap();
        assert_eq!(book.get_table("Orders").is_some(), totals);
        if totals { assert!(!book.get_table("Orders").unwrap().has_insert_row()); }
        assert_restorable(&book);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
    }
}
