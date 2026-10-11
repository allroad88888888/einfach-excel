//! 配置历史只改变验证规则，不能重写已有值或耗掉失败操作的 redo。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn rule(max: f64) -> Rule {
    Rule {
        kind: Kind::WholeNumber { min: 0.0, max },
        ignore_blank: true,
        operator: Default::default(),
    }
}

#[test]
fn set_replace_clear_undo_redo_preserve_values_and_sparse_atoms() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(999.0));
    let mut history = WorkbookHistory::default();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    let area = range("A1", "A1048576");
    history
        .set_data_validation(&mut book, 0, area, Some(rule(10.0)))
        .unwrap();
    let initial = book.sheet(0).unwrap().data_validations().to_vec();
    history
        .set_data_validation(&mut book, 0, range("A56", "A56"), Some(rule(20.0)))
        .unwrap();
    let replaced = book.sheet(0).unwrap().data_validations().to_vec();
    history
        .set_data_validation(&mut book, 0, area, None)
        .unwrap();
    assert!(book.sheet(0).unwrap().data_validations().is_empty());
    assert_eq!(history.undo_count(), 3);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().data_validations(), replaced);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().data_validations(), initial);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().data_validations().is_empty());
    for _ in 0..3 {
        history.redo(&mut book).unwrap();
    }
    assert!(book.sheet(0).unwrap().data_validations().is_empty());
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(999.0));
}

#[test]
fn invalid_noop_and_pending_commands_preserve_existing_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let area = range("A1", "A20");
    history
        .set_data_validation(&mut book, 0, area, Some(rule(10.0)))
        .unwrap();
    history
        .set_data_validation(&mut book, 0, area, Some(rule(20.0)))
        .unwrap();
    history.undo(&mut book).unwrap();
    history
        .set_data_validation(&mut book, 0, range("A5", "A6"), Some(rule(10.0)))
        .unwrap();
    history
        .set_data_validation(&mut book, 0, range("B1", "B2"), None)
        .unwrap();
    assert!(history
        .set_data_validation(&mut book, 0, area, Some(rule(-1.0)))
        .is_err());
    assert!(history
        .set_data_validation(&mut book, 5, area, Some(rule(10.0)))
        .is_err());
    assert_eq!((history.undo_count(), history.redo_count()), (1, 1));
    history
        .begin(&book, 0, range("B1", "B1"), "input", true)
        .unwrap();
    assert!(history
        .set_data_validation(&mut book, 0, area, None)
        .is_err());
    history.finish(&mut book, true).unwrap();
    assert_eq!((history.undo_count(), history.redo_count()), (1, 1));
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0).unwrap().data_validation_at(area.start),
        Some(&rule(20.0))
    );
}

#[test]
fn history_rejects_foreign_workbooks_and_out_of_band_configuration_changes() {
    let mut book = Workbook::new();
    let mut other = Workbook::new();
    let mut history = WorkbookHistory::default();
    let area = range("A1", "A20");
    history
        .set_data_validation(&mut book, 0, area, Some(rule(10.0)))
        .unwrap();
    assert!(history.undo(&mut other).is_err());
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(area, Some(rule(20.0)))
        .unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        book.sheet(0).unwrap().data_validation_at(area.start),
        Some(&rule(20.0))
    );
}
