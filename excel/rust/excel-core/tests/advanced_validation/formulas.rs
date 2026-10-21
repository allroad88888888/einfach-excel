use super::*;

#[test]
fn candidate_changes_referenced_dynamic_array_spill_members_before_literal_write() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "2").unwrap();
    book.set_formula(0, "C1", "=SEQUENCE(2,1,A1)");
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(3.));
    install(&mut book, range("A1", "A1"), formula("=C2>0", "A1"));
    assert_eq!(
        book.set_cell_input(0, "A1", "-4"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(3.));
}

#[test]
fn relative_range_anchors_and_absolute_refs_use_candidate_values() {
    let mut book = Workbook::new();
    book.set_cell(0, "D1", Value::Number(3.));
    install(
        &mut book,
        range("B2", "B3"),
        formula("=AND(B2>0,B2<$D$1)", "B2"),
    );
    book.set_cell_input(0, "B2", "2").unwrap();
    book.set_cell_input(0, "B3", "1").unwrap();
    assert_eq!(
        book.set_cell_input(0, "B3", "3"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(1.));
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
}

#[test]
fn cross_sheet_formula_dependencies_read_candidate_instead_of_cached_old_value() {
    let mut book = Workbook::new();
    book.add_sheet("Report");
    book.set_cell(0, "A1", Value::Number(1.));
    book.set_formula(1, "A1", "=Sheet1!A1*2");
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(2.));
    install(&mut book, range("A1", "A1"), formula("=Report!A1<10", "A1"));
    assert_eq!(
        book.set_cell_input(0, "A1", "7"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(2.));
    book.set_cell_input(0, "A1", "4").unwrap();
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(8.));
}

#[test]
fn ignore_blank_does_not_replace_custom_formula_blank_semantics() {
    let mut book = Workbook::new();
    let mut rule = formula("=FALSE", "A1");
    rule.ignore_blank = true;
    install(&mut book, range("A1", "A1"), rule.clone());
    book.set_cell_input(0, "A1", "").unwrap();
    rule.ignore_blank = false;
    install(&mut book, range("A1", "A1"), rule);
    assert_eq!(
        book.set_cell_input(0, "A1", ""),
        Err("DATA_VALIDATION_FAILED")
    );
    install(&mut book, range("A1", "A1"), formula("=LEN(A1)=0", "A1"));
    book.set_cell_input(0, "A1", "").unwrap();
}

#[test]
fn invalid_formula_definition_and_runtime_array_errors_are_rejected_atomically() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    assert!(history
        .set_data_validation(
            &mut book,
            0,
            range("A1", "A1"),
            Some(formula("=SUM(", "A1"))
        )
        .is_err());
    assert_eq!(history.undo_count(), 0);
    for source in ["=1/0", "=\"TRUE\"", "={TRUE,FALSE}"] {
        install(&mut book, range("A1", "A1"), formula(source, "A1"));
        assert_eq!(
            book.set_cell_input(0, "A1", "4"),
            Err("DATA_VALIDATION_FAILED")
        );
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    }
    install(&mut book, range("A1", "A1"), formula("=A1<2", "A1"));
    assert_eq!(
        book.set_cell_input(0, "A1", "=SEQUENCE(2,1,4)"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
}

#[test]
fn sparse_aggregate_sees_new_candidate_even_when_target_was_empty() {
    let mut book = Workbook::new();
    book.set_cell(0, "A9", Value::Number(2.));
    install(&mut book, range("A1", "A1"), formula("=SUM(A:A)<5", "A1"));
    assert_eq!(
        book.set_cell_input(0, "A1", "4"),
        Err("DATA_VALIDATION_FAILED")
    );
    book.set_cell_input(0, "A1", "2").unwrap();
}

#[test]
fn split_regions_keep_original_formula_anchor_and_options_in_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let rule = alert(formula("=A1<3", "A1"), ValidationErrorStyle::Warning);
    history
        .set_data_validation(&mut book, 0, range("A1", "A3"), Some(rule.clone()))
        .unwrap();
    history
        .set_data_validation(&mut book, 0, range("A2", "A2"), None)
        .unwrap();
    assert_eq!(
        book.sheet(0).unwrap().data_validation_at(addr("A3")),
        Some(&rule)
    );
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().data_validations().is_empty());
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0).unwrap().data_validation_at(addr("A3")),
        Some(&rule)
    );
}
