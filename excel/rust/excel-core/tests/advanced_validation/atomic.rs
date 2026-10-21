use super::*;

#[test]
fn all_value_and_formula_paste_modes_enforce_custom_rules() {
    for mode in [
        ClipboardPasteMode::All,
        ClipboardPasteMode::Values,
        ClipboardPasteMode::Formulas,
        ClipboardPasteMode::FormulasAndNumberFormats,
        ClipboardPasteMode::ValuesAndFormats,
        ClipboardPasteMode::ValuesAndNumberFormats,
    ] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        install(&mut book, range("A1", "A1"), formula("=A1<3", "A1"));
        book.set_cell(0, "D1", Value::Number(7.));
        book.set_formula(0, "E1", "=9");
        let clip = book.capture_clipboard(0, range("D1", "E1"), false).unwrap();
        let options = ClipboardPasteOptions {
            mode,
            ..ClipboardPasteOptions::new(range("A1", "A1"))
        };
        assert_eq!(
            book.paste_clipboard_with_history(&clip, 0, &options, &mut history),
            Err("DATA_VALIDATION_FAILED")
        );
        assert_eq!(history.undo_count(), 0);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
    }
}

#[test]
fn paste_validates_the_complete_batch_and_warning_continue_remains_one_transaction() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("A1", "A1"), formula("=A1=B1", "A1"));
    let options = ClipboardPasteOptions::new(range("A1", "A1"));
    let clip = ClipboardSnapshot::from_tsv("7\t7", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        .unwrap();
    assert_eq!(history.undo_count(), 1);
    install(
        &mut book,
        range("A1", "A1"),
        alert(formula("=A1=B1", "A1"), ValidationErrorStyle::Warning),
    );
    let clip = ClipboardSnapshot::from_tsv("9\t8", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        book.paste_clipboard_with_history(&clip, 0, &options, &mut history),
        Err("DATA_VALIDATION_WARNING")
    );
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(7.));
    book.with_validation_confirmation(true, |book| {
        book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
    })
    .unwrap();
    assert_eq!(history.undo_count(), 2);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(7.));
}

#[test]
fn stop_in_same_batch_cannot_be_overridden_by_warning_confirmation() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(
        &mut book,
        range("A1", "A1"),
        alert(formula("=FALSE", "A1"), ValidationErrorStyle::Warning),
    );
    install(&mut book, range("B1", "B1"), formula("=FALSE", "B1"));
    let clip = ClipboardSnapshot::from_tsv("9\t8", ClipboardPasteMode::All).unwrap();
    let options = ClipboardPasteOptions::new(range("A1", "A1"));
    assert_eq!(
        book.with_validation_confirmation(true, |book| book.paste_clipboard_with_history(
            &clip,
            0,
            &options,
            &mut history
        )),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(history.undo_count(), 0);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
}

#[test]
fn explicit_and_inferred_fill_reject_and_rollback_then_confirm_atomically() {
    for infer in [false, true] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.set_cell(0, "A1", Value::Number(7.));
        install(
            &mut book,
            range("A2", "A3"),
            alert(formula("=A2<5", "A2"), ValidationErrorStyle::Information),
        );
        let apply = |book: &mut Workbook| {
            if infer {
                book.apply_inferred_auto_fill(&fill())
            } else {
                book.apply_auto_fill(&fill())
            }
        };
        assert!(apply(&mut book)
            .unwrap_err()
            .to_string()
            .contains("DATA_VALIDATION_INFORMATION"));
        assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        history
            .begin(&book, 0, range("A2", "A3"), "Fill down", true)
            .unwrap();
        book.with_validation_confirmation(true, |book| {
            if infer {
                history.apply_inferred_auto_fill(book, &fill())
            } else {
                history.apply_auto_fill(book, &fill())
            }
        })
        .unwrap();
        history.finish(&mut book, true).unwrap();
        assert_eq!(history.undo_count(), 1);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.));
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.));
    }
}
