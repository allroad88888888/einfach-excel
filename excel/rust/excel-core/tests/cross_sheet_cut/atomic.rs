use super::*;
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::protection::ProtectionChange;
use std::{cell::Cell, rc::Rc};

#[test]
fn dependent_formula_validation_rolls_back_without_publishing_candidate_values() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(2, "A1", "='Source O''Brien'!A1");
    book.sheet_mut(2)
        .unwrap()
        .set_data_validation(
            range("A1", "A1"),
            Some(Rule {
                kind: Kind::CustomFormula {
                    formula: "=FALSE".into(),
                    anchor: CellAddress::new(0, 0),
                },
                ignore_blank: false,
                operator: Default::default(),
                options: Default::default(),
            }),
        )
        .unwrap();
    let clip = cut(&book, "A1", "A1");
    let notifications = Rc::new(Cell::new(0));
    for (index, address) in [(0, "A1"), (1, "C4"), (2, "A1")] {
        let count = notifications.clone();
        book.sheet_mut(index)
            .unwrap()
            .subscribe_cell(address, move || count.set(count.get() + 1));
    }
    notifications.set(0);
    let mut history = WorkbookHistory::default();
    assert_eq!(
        book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(4.));
    assert_eq!(
        book.sheet(2).unwrap().get_formula("A1").as_deref(),
        Some("='Source O''Brien'!A1")
    );
    assert_eq!(notifications.get(), 0);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn affected_dynamic_ranges_and_offset_reject_without_translating_only_their_anchors() {
    for formula in [
        "=SUM('Source O''Brien'!A1:OFFSET('Source O''Brien'!A1,4,0))",
        "=SUM(OFFSET('Source O''Brien'!A1,0,0,5,1))",
        "=SUM('Source O''Brien'!A1:INDEX('Source O''Brien'!A1:A5,5))",
    ] {
        let mut book = workbook();
        book.set_cell(0, "A1", Value::Number(4.));
        book.set_formula(2, "A1", formula);
        let clip = cut(&book, "A1", "A1");
        assert_eq!(
            book.paste_clipboard(&clip, 1, &options("C4")),
            Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE")
        );
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
        assert_eq!(
            book.sheet(2).unwrap().get_formula("A1").as_deref(),
            Some(formula)
        );
    }
}

#[test]
fn partial_reference_rejects_without_clearing_source_target_or_redo_then_snapshot_retries() {
    let mut book = workbook();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 1, "E1", "redo").unwrap();
    history.undo(&mut book).unwrap();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_cell(1, "C4", Value::Number(9.));
    book.set_formula(2, "A1", "=SUM('Source O''Brien'!A1:A3)");
    let clip = cut(&book, "A1", "A1");
    assert_eq!(
        book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history),
        Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    book.set_formula(2, "A1", "='Source O''Brien'!A1");
    book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        .unwrap();
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(4.));
}

#[test]
fn each_actual_write_sheet_is_checked_again_after_capture() {
    for locked in [0, 1, 2] {
        let mut book = workbook();
        book.set_cell(0, "A1", Value::Number(4.));
        book.set_cell(1, "C4", Value::Number(9.));
        book.set_formula(2, "A1", "='Source O''Brien'!A1");
        let clip = cut(&book, "A1", "A1");
        book.change_protection(locked, ProtectionChange::Protect)
            .unwrap();
        let mut history = WorkbookHistory::default();
        assert!(book
            .paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
            .is_err());
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
        assert_eq!(
            book.sheet(2).unwrap().get_formula("A1").as_deref(),
            Some("='Source O''Brien'!A1")
        );
        assert_eq!(history.undo_count(), 0);
        assert!(!history.is_pending());
    }
}

#[test]
fn destination_unlocked_ranges_are_not_mistaken_for_source_coordinates() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    let clip = cut(&book, "A1", "A1");
    let mut target = options("C4");
    target.unlocked_ranges = Some(vec![range("C4", "C4")]);
    book.paste_clipboard(&clip, 1, &target).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(4.));
}

#[test]
fn postwrite_formula_validation_restores_three_sheets_and_keeps_redo() {
    for recorded in [false, true] {
        let mut book = workbook();
        let mut history = WorkbookHistory::default();
        history.set_cell_input(&mut book, 1, "E1", "redo").unwrap();
        history.undo(&mut book).unwrap();
        book.set_formula(0, "A1", "=20");
        book.set_cell(1, "C4", Value::Number(9.));
        book.set_formula(2, "A1", "='Source O''Brien'!A1");
        book.sheet_mut(1)
            .unwrap()
            .set_data_validation(
                range("C4", "C4"),
                Some(Rule {
                    kind: Kind::WholeNumber { min: 0., max: 10. },
                    ignore_blank: true,
                    operator: Default::default(),
                    options: Default::default(),
                }),
            )
            .unwrap();
        let clip = cut(&book, "A1", "A1");
        let result = if recorded {
            book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        } else {
            book.paste_clipboard(&clip, 1, &options("C4"))
        };
        assert_eq!(result, Err("DATA_VALIDATION_FAILED"));
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(20.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
        assert_eq!(
            book.sheet(2).unwrap().get_formula("A1").as_deref(),
            Some("='Source O''Brien'!A1")
        );
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
        assert!(!history.is_pending());
        book.sheet_mut(1)
            .unwrap()
            .set_data_validation(range("C4", "C4"), None)
            .unwrap();
        book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
            .unwrap();
    }
}

#[test]
fn array_destination_and_changed_source_leave_both_sheets_untouched() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(1, "C3", "=SEQUENCE(2)");
    book.get_cell("Target O'Brien", "C3");
    let clip = cut(&book, "A1", "A1");
    assert_eq!(
        book.paste_clipboard(&clip, 1, &options("C4")),
        Err("CLIPBOARD_SPILL_TARGET")
    );
    book.set_cell(0, "A1", Value::Number(7.));
    assert_eq!(
        book.paste_clipboard(&clip, 1, &options("D4")),
        Err("CLIPBOARD_CUT_SOURCE_CHANGED")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(7.));
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Null);
}
