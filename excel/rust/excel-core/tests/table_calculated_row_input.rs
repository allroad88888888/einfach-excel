//! 新行显式输入公式的校验必须读取整行继承后的最终值，而不是中间空格。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn seed(required: f64) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Input".into()));
    book.set_cell(0, "B1", Value::Text("Calculated".into()));
    book.define_table(Some("Orders"), 0, CellRange::new(
        CellAddress::new(0, 0), CellAddress::new(2, 1)), true).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B2", "=10").unwrap();
    book.sheet_mut(0).unwrap().set_data_validation(CellRange::single(CellAddress::new(3, 0)),
        Some(DataValidationRule {
            kind: DataValidationKind::WholeNumber { min: required, max: required },
            ignore_blank: true, operator: Default::default(),
        })).unwrap();
    history.clear("");
    (book, history)
}

#[test]
fn explicit_input_formula_is_validated_after_other_calculated_cells_are_inherited() {
    let (mut book, mut history) = seed(11.);
    let before = book.snapshot_tables();
    history.set_cell_input(&mut book, 0, "A4", "=B4+1").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(11.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(10.));
    assert_eq!(history.undo_count(), 1);
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "A4"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(11.));
    }
}

#[test]
fn final_validation_failure_rolls_back_explicit_formula_inheritance_and_geometry() {
    let (mut book, mut history) = seed(12.);
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    assert_eq!(history.set_cell_input(&mut book, 0, "A4", "=B4+1").unwrap_err(),
        "DATA_VALIDATION_FAILED");
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(history.redo_count(), 1);
}
