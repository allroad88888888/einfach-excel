use super::*;
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::workbook::advanced_validation::{
    AdvancedValidationOptions, ValidationErrorAlert, ValidationErrorStyle,
};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::MergeAction;

#[test]
fn moved_formulas_with_implicit_or_this_row_table_context_reject_atomically() {
    for formula in ["=[@Qty]", "=Orders[@Qty]"] {
        let mut book = workbook();
        book.set_formula(0, "A1", formula);
        let clip = cut(&book, "A1", "A1");
        assert_eq!(
            book.paste_clipboard(&clip, 1, &options("C4")),
            Err("CLIPBOARD_CROSS_SHEET_TABLE")
        );
        assert_eq!(
            book.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some(formula)
        );
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
    }
}

#[test]
fn source_and_scalar_destination_merge_geometry_reject_without_consuming_history() {
    for source_merged in [false, true] {
        let mut book = workbook();
        book.set_cell(0, "A1", Value::Number(4.));
        if source_merged {
            book.merge_cells(0, range("A1", "B1"), MergeAction::Merge, false)
                .unwrap();
        } else {
            book.merge_cells(1, range("C4", "D4"), MergeAction::Merge, false)
                .unwrap();
        }
        let clip = cut(&book, "A1", if source_merged { "B1" } else { "A1" });
        let mut history = WorkbookHistory::default();
        let target = if source_merged {
            options("C4")
        } else {
            ClipboardPasteOptions::new(range("C4", "D4"))
        };
        assert_eq!(
            book.paste_clipboard_with_history(&clip, 1, &target, &mut history),
            Err("CLIPBOARD_CROSS_SHEET_MERGE")
        );
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
        assert_eq!(history.undo_count(), 0);
    }
}

fn number_rule(style: ValidationErrorStyle) -> Rule {
    Rule {
        kind: Kind::WholeNumber { min: 0., max: 10. },
        ignore_blank: true,
        operator: Default::default(),
        options: AdvancedValidationOptions {
            error_alert: Some(ValidationErrorAlert {
                style,
                title: "Check".into(),
                message: "Up to 10".into(),
            }),
            ..Default::default()
        },
    }
}

#[test]
fn warning_confirmation_retries_the_same_snapshot_as_one_history_transaction() {
    for formula in [false, true] {
        let mut book = workbook();
        let mut history = WorkbookHistory::default();
        if formula {
            book.set_formula(0, "A1", "=20");
        } else {
            book.set_cell(0, "A1", Value::Number(20.));
        }
        book.set_cell(1, "C4", Value::Number(9.));
        book.sheet_mut(1)
            .unwrap()
            .set_data_validation(
                range("C4", "C4"),
                Some(number_rule(ValidationErrorStyle::Warning)),
            )
            .unwrap();
        let clip = cut(&book, "A1", "A1");
        assert_eq!(
            book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history),
            Err("DATA_VALIDATION_WARNING")
        );
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(20.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
        assert_eq!(history.undo_count(), 0);
        book.with_validation_confirmation(true, |book| {
            book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        })
        .unwrap();
        assert_eq!(history.undo_count(), 1);
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Null);
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(20.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
    }
}

#[test]
fn stop_formula_validation_cannot_be_overridden_by_confirmation() {
    let mut book = workbook();
    book.set_formula(0, "A1", "=20");
    book.sheet_mut(1)
        .unwrap()
        .set_data_validation(
            range("C4", "C4"),
            Some(number_rule(ValidationErrorStyle::Stop)),
        )
        .unwrap();
    let clip = cut(&book, "A1", "A1");
    assert_eq!(
        book.with_validation_confirmation(true, |book| book.paste_clipboard(
            &clip,
            1,
            &options("C4")
        )),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(20.));
}

#[test]
fn source_or_target_table_overlap_is_explicitly_rejected_before_data_changes() {
    for sheet in ["Source O'Brien", "Target O'Brien"] {
        let mut book = workbook();
        book.set_cell(0, "A1", Value::Number(4.));
        let clip = cut(&book, "A1", "A1");
        let geometry = if sheet == "Source O'Brien" {
            range("A1", "A2")
        } else {
            range("C4", "C5")
        };
        book.restore_tables(TableRegistrySnapshot::from_entries(vec![
            TableEntry::from_parts("Orders", sheet, geometry, false, false, vec!["Qty".into()]),
        ]))
        .unwrap();
        assert_eq!(
            book.paste_clipboard(&clip, 1, &options("C4")),
            Err("CLIPBOARD_CROSS_SHEET_TABLE")
        );
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
    }
}

#[test]
fn unrelated_dynamic_formulas_and_text_indirect_do_not_invalidate_a_static_move() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(2, "A1", "=SUM(B1:OFFSET(B1,4,0))");
    book.set_formula(2, "C1", "=INDIRECT(\"'Source O''Brien'!A1\")");
    let clip = cut(&book, "A1", "A1");
    book.paste_clipboard(&clip, 1, &options("C4")).unwrap();
    assert_eq!(
        book.sheet(2).unwrap().get_formula("A1").as_deref(),
        Some("=SUM(B1:OFFSET(B1,4,0))")
    );
    assert_eq!(
        book.sheet(2).unwrap().get_formula("C1").as_deref(),
        Some("=INDIRECT(\"'Source O''Brien'!A1\")")
    );
}

#[test]
fn position_functions_keep_excel_position_semantics_after_moving_the_formula() {
    let mut book = workbook();
    book.set_formula(0, "A1", "=ROW()+COLUMN()");
    let clip = cut(&book, "A1", "A1");
    book.paste_clipboard(&clip, 1, &options("C4")).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(7.));
    assert_eq!(
        book.sheet(1).unwrap().get_formula("C4").as_deref(),
        Some("=ROW()+COLUMN()")
    );
}
