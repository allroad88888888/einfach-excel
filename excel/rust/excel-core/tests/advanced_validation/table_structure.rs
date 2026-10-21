use super::*;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::{TableEntry, TableRegistrySnapshot};

#[test]
fn table_header_warning_confirmation_uses_native_rename_with_one_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts(
            "Orders",
            "Sheet1",
            range("A1", "B2"),
            true,
            false,
            vec!["Qty".into(), "Price".into()],
        ),
    ]))
    .unwrap();
    install(
        &mut book,
        range("A1", "A1"),
        alert(formula("=A1=\"Qty\"", "A1"), ValidationErrorStyle::Warning),
    );
    assert_eq!(
        history.set_cell_input(&mut book, 0, "A1", "Count"),
        Err("DATA_VALIDATION_WARNING".into())
    );
    assert_eq!(book.get_table("Orders").unwrap().columns()[0], "Qty");
    book.with_validation_confirmation(true, |book| history.set_cell_input(book, 0, "A1", "Count"))
        .unwrap();
    assert_eq!(book.get_table("Orders").unwrap().columns()[0], "Count");
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().columns()[0], "Qty");
    assert_eq!(book.get_table("Orders").unwrap().columns()[1], "Price");
}

#[test]
fn structural_shift_moves_local_formula_anchor_and_preserves_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("B2", "B4"), formula("=B2>0", "B2"));
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    let rule = book
        .sheet(0)
        .unwrap()
        .data_validation_at(addr("B3"))
        .unwrap();
    assert!(
        matches!(&rule.kind, DataValidationKind::CustomFormula { formula, anchor }
        if einfach_excel_core::parse_formula(formula) == einfach_excel_core::parse_formula("=B3>0") && *anchor == addr("B3"))
    );
    assert_eq!(
        book.set_cell_input(0, "B4", "-1"),
        Err("DATA_VALIDATION_FAILED")
    );
    history.undo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0).unwrap().data_validation_at(addr("B2")),
        Some(&formula("=B2>0", "B2"))
    );
}

#[test]
fn literal_replacing_old_formula_uses_candidate_metadata_for_isformula() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=1");
    install(
        &mut book,
        range("A1", "A1"),
        formula("=NOT(ISFORMULA(A1))", "A1"),
    );
    book.set_cell_input(0, "A1", "2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
    assert!(book.sheet(0).unwrap().get_formula("A1").is_none());
}

#[test]
fn full_column_validation_keeps_bounds_but_moves_formula_and_anchor() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "B1", "3").unwrap();
    install(
        &mut book,
        range("A1", "A1048576"),
        formula("=A1>$B$1", "A1"),
    );
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    let region = &book.sheet(0).unwrap().data_validations()[0];
    assert_eq!(region.range, range("A1", "A1048576"));
    assert!(
        matches!(&region.rule.kind, DataValidationKind::CustomFormula { formula, anchor }
        if einfach_excel_core::parse_formula(formula) == einfach_excel_core::parse_formula("=A2>$B$2") && *anchor == addr("A2"))
    );
    book.set_cell_input(0, "A1", "4").unwrap();
    assert_eq!(
        book.set_cell_input(0, "A2", "2"),
        Err("DATA_VALIDATION_FAILED")
    );
}

#[test]
fn cross_sheet_reference_shift_undo_redo_restores_the_owner_rule_directory() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let rates = book.add_sheet("Rates");
    book.set_cell_input(rates, "B1", "3").unwrap();
    install(
        &mut book,
        range("A1", "A1"),
        formula("=A1>Rates!$B$1", "A1"),
    );
    history
        .edit_structure(&mut book, rates, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    let matches_formula = |book: &Workbook, source: &str| {
        matches!(&book.sheet(0).unwrap().data_validation_at(addr("A1")).unwrap().kind,
            DataValidationKind::CustomFormula { formula, .. }
            if einfach_excel_core::parse_formula(formula) == einfach_excel_core::parse_formula(source))
    };
    assert!(matches_formula(&book, "=A1>Rates!$B$2"));
    history.undo(&mut book).unwrap();
    assert!(matches_formula(&book, "=A1>Rates!$B$1"));
    history.redo(&mut book).unwrap();
    assert!(matches_formula(&book, "=A1>Rates!$B$2"));
    assert_eq!(
        book.set_cell_input(0, "A1", "2"),
        Err("DATA_VALIDATION_FAILED")
    );
}
