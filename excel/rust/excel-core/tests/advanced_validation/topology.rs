use super::*;

fn source(book: &Workbook, sheet: usize, address: &str) -> String {
    let rule = book
        .sheet(sheet)
        .unwrap()
        .data_validation_at(addr(address))
        .unwrap();
    let DataValidationKind::CustomFormula { formula, .. } = &rule.kind else {
        panic!("Expected custom formula")
    };
    formula.clone()
}

fn same_formula(actual: &str, expected: &str) -> bool {
    einfach_excel_core::parse_formula(actual) == einfach_excel_core::parse_formula(expected)
}

#[test]
fn sheet_rename_history_preserves_original_and_preexisting_dangling_validation_sources() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let rates = book.add_sheet("Rates");
    book.set_cell_input(rates, "B1", "3").unwrap();
    install(
        &mut book,
        range("A1", "A1"),
        formula("=A1>Rates!$B$1", "A1"),
    );
    install(
        &mut book,
        range("C1", "C1"),
        formula("=C1>Future!$B$1", "C1"),
    );
    history
        .edit_sheet(&mut book, Some(rates), "Future")
        .unwrap();
    assert!(same_formula(&source(&book, 0, "A1"), "=A1>Future!$B$1"));
    assert!(same_formula(&source(&book, 0, "C1"), "=C1>Future!$B$1"));
    assert_eq!(
        book.set_cell_input(0, "A1", "2"),
        Err("DATA_VALIDATION_FAILED")
    );
    history.undo(&mut book).unwrap();
    assert_eq!(source(&book, 0, "A1"), "=A1>Rates!$B$1");
    assert_eq!(source(&book, 0, "C1"), "=C1>Future!$B$1");
    history.redo(&mut book).unwrap();
    assert!(same_formula(&source(&book, 0, "A1"), "=A1>Future!$B$1"));
}

#[test]
fn deleting_referenced_sheet_rewrites_validation_and_restores_owner_after_index_shift() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let owner = book.add_sheet("Owner");
    book.set_cell_input(0, "B1", "3").unwrap();
    book.sheet_mut(owner)
        .unwrap()
        .set_data_validation(range("A1", "A1"), Some(formula("=A1>Sheet1!$B$1", "A1")))
        .unwrap();
    history.remove_sheet(&mut book, 0).unwrap();
    assert_eq!(book.index_of("Owner"), Some(0));
    assert!(source(&book, 0, "A1").contains("#REF!"));
    assert_eq!(
        book.set_cell_input(0, "A1", "4"),
        Err("DATA_VALIDATION_FAILED")
    );
    history.undo(&mut book).unwrap();
    assert_eq!(source(&book, 1, "A1"), "=A1>Sheet1!$B$1");
    history.redo(&mut book).unwrap();
    assert!(source(&book, 0, "A1").contains("#REF!"));
}

#[test]
fn undo_new_sheet_preserves_prior_dangling_validation_source_without_ref_conversion() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("A1", "A1"), formula("=A1>Future!B1", "A1"));
    history.edit_sheet(&mut book, None, "Future").unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(source(&book, 0, "A1"), "=A1>Future!B1");
    history.redo(&mut book).unwrap();
    assert_eq!(source(&book, 0, "A1"), "=A1>Future!B1");
}
