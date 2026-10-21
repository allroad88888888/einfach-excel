//! 手动扩表继承计算列：空格填充、汇总搬移与拒绝回滚只占一条历史。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (addr, name) in [("A1", "Amount"), ("B1", "Total"), ("C1", "Extra")] {
        book.set_cell(0, addr, Value::Text(name.into()));
    }
    book.set_cell(0, "A2", Value::Number(1.));
    book.set_cell(0, "A3", Value::Number(2.));
    book.define_table(Some("Orders"), 0, range("A1", "B3"), true).unwrap();
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
fn manual_growth_fills_only_new_empty_cells_and_notifies_once_per_history_step() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "A4", Value::Number(3.));
    book.set_cell(0, "B5", Value::Number(99.));
    book.set_formula(0, "B6", "=\"\"");
    let before = book.snapshot_tables();
    let calls = observe(&mut book);
    history.resize_table(&mut book, "Orders", range("A1", "B7")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(6.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
    assert_eq!(book.sheet(0).unwrap().get_formula("B6").as_deref(), Some("=\"\""));
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(0.));
    assert_eq!(history.undo_count(), 1);
    assert_eq!(calls.replace(0), 1);
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
        assert_eq!(calls.replace(0), 1);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(6.));
        assert_eq!(calls.replace(0), 1);
    }
}

#[test]
fn moving_totals_fills_the_vacated_row_and_restores_both_rows_on_undo() {
    let (mut book, mut history) = seed();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    book.set_cell(0, "A5", Value::Number(5.));
    book.set_cell(0, "A6", Value::Number(6.));
    let old_total = book.sheet(0).unwrap().get_formula("B4");
    history.clear("");
    history.resize_table(&mut book, "Orders", range("A1", "B7")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(10.));
    assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(12.));
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(28.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_formula("B4"), old_total);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(6.));
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(28.));
}

#[test]
fn invalid_last_new_row_rolls_back_totals_geometry_values_and_notifications() {
    let (mut book, mut history) = seed();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    book.set_cell(0, "A5", Value::Number(100.));
    book.sheet_mut(0).unwrap().set_data_validation(range("B5", "B5"), Some(DataValidationRule {
        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 0., max: 10. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    history.clear("");
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    let calls = observe(&mut book);
    assert_eq!(history.resize_table(&mut book, "Orders", range("A1", "B6")).unwrap_err(),
        "DATA_VALIDATION_FAILED");
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(6.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B6"), Value::Null);
    assert_eq!(history.redo_count(), 1);
    assert_eq!(calls.get(), 0);
}

#[test]
fn simultaneous_column_removal_preserves_rewritten_existing_formulas_in_one_snapshot() {
    let (mut book, mut history) = seed();
    history.resize_table(&mut book, "Orders", range("A1", "C3")).unwrap();
    book.set_formula(0, "A4", "=SUM(Orders[Extra])");
    let original = book.sheet(0).unwrap().get_formula("A4");
    history.clear("");
    history.resize_table(&mut book, "Orders", range("A1", "B5")).unwrap();
    assert!(book.sheet(0).unwrap().get_formula("A4").unwrap().contains("#REF!"));
    assert!(book.sheet(0).unwrap().get_formula("B4").is_some());
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_formula("A4"), original);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    history.redo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().get_formula("A4").unwrap().contains("#REF!"));
}

#[test]
fn two_calculated_columns_see_final_values_before_spill_and_validation_checks() {
    let (mut book, mut history) = seed();
    history.resize_table(&mut book, "Orders", range("A1", "C3")).unwrap();
    history.set_cell_input(&mut book, 0, "C2", "=10").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "=IF(C2=0,SEQUENCE(2),C2+1)").unwrap();
    history.clear("");
    history.resize_table(&mut book, "Orders", range("A1", "C5")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(11.));
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(11.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(11.));
}

#[test]
fn final_array_or_cycle_rejects_without_residual_cells_or_geometry() {
    for source in ["=IF(ROW()>3,SEQUENCE(2),10)", "=A2"] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "B2", source).unwrap();
        if source == "=A2" { book.set_formula(0, "A4", "=B4"); }
        let before = book.snapshot_tables();
        history.clear("");
        assert!(history.resize_table(&mut book, "Orders", range("A1", "B5")).is_err());
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn excessive_inheritance_is_rejected_before_geometry_changes_or_cell_allocation() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    assert!(history.resize_table(&mut book, "Orders", range("A1", "B1048576"))
        .unwrap_err().contains("32 MiB"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn header_only_table_keeps_its_template_and_refills_only_empty_rows_on_growth() {
    let (mut book, mut history) = seed();
    history.resize_table(&mut book, "Orders", range("A1", "B1")).unwrap();
    book.clear_cell(0, "B2");
    book.set_cell(0, "B3", Value::Number(99.));
    history.clear("");
    history.resize_table(&mut book, "Orders", range("A1", "B4")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(0.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B1"));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(99.));
}

#[test]
fn shifting_columns_while_growing_uses_rewritten_template_and_preserves_outside_cells() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "A4", Value::Number(7.));
    book.set_cell(0, "C4", Value::Number(99.));
    let before = book.snapshot_tables();
    history.resize_table(&mut book, "Orders", range("B1", "C5")).unwrap();
    assert!(book.sheet(0).unwrap().get_formula("B4").unwrap().contains("#REF!"));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(99.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(99.));
    history.redo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().get_formula("B5").unwrap().contains("#REF!"));
}
