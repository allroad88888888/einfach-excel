use super::*;
use einfach_excel_core::protection::ProtectionChange;

#[test]
fn warning_and_information_require_explicit_native_confirmation_with_one_history() {
    for (style, code) in [
        (ValidationErrorStyle::Warning, "DATA_VALIDATION_WARNING"),
        (
            ValidationErrorStyle::Information,
            "DATA_VALIDATION_INFORMATION",
        ),
    ] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        install(
            &mut book,
            range("A1", "A1"),
            alert(formula("=A1<3", "A1"), style),
        );
        assert_eq!(
            history.set_cell_input(&mut book, 0, "A1", "7"),
            Err(code.into())
        );
        assert_eq!(history.undo_count(), 0);
        let detail = book.take_validation_failure().unwrap();
        assert_eq!((detail.row, detail.col, detail.style), (0, 0, style));
        assert_eq!(detail.message, "请输入有效数量");
        assert!(book.take_validation_failure().is_none());
        book.with_validation_confirmation(true, |book| history.set_cell_input(book, 0, "A1", "7"))
            .unwrap();
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.));
        assert_eq!(history.undo_count(), 1);
        assert_eq!(
            history.set_cell_input(&mut book, 0, "A1", "9"),
            Err(code.into())
        );
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.));
    }
}

#[test]
fn confirmation_never_bypasses_stop_or_protection_and_restores_after_panic() {
    let mut book = Workbook::new();
    install(&mut book, range("A1", "A1"), formula("=FALSE", "A1"));
    assert_eq!(
        book.with_validation_confirmation(true, |book| book.set_cell_input(0, "A1", "7")),
        Err("DATA_VALIDATION_FAILED")
    );
    install(
        &mut book,
        range("A1", "A1"),
        alert(formula("=FALSE", "A1"), ValidationErrorStyle::Warning),
    );
    book.change_protection(0, ProtectionChange::Protect)
        .unwrap();
    assert!(book
        .with_validation_confirmation(true, |book| book.set_cell_input(0, "A1", "7"))
        .unwrap_err()
        .contains("protected"));
    book.change_protection(0, ProtectionChange::Unprotect)
        .unwrap();
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        book.with_validation_confirmation(true, |_| panic!("scope unwind"));
    }));
    assert_eq!(
        book.set_cell_input(0, "A1", "7"),
        Err("DATA_VALIDATION_WARNING")
    );
}

#[test]
fn message_definition_limits_are_checked_before_history_changes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let mut rule = alert(formula("=TRUE", "A1"), ValidationErrorStyle::Stop);
    for text in ["🙂".repeat(33), "bad\0title".into()] {
        rule.options.input_message.as_mut().unwrap().title = text;
        assert!(history
            .set_data_validation(&mut book, 0, range("A1", "A1"), Some(rule.clone()))
            .is_err());
    }
    assert_eq!(history.undo_count(), 0);
    assert!(book.sheet(0).unwrap().data_validations().is_empty());
}
