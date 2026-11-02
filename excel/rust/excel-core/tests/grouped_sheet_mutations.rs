use einfach_core::Value;
use einfach_excel_core::{
    data_validation::{
        AdvancedValidationOptions, DataValidationKind, DataValidationOperator, DataValidationRule,
    },
    protection::ProtectionChange,
    sheet::BorderPreset,
    workbook_history::{ClearSelectionMode, WorkbookHistory},
    BorderSpec, BorderStyle, CellAddress, CellFormat, CellRange, CellStyle, NumberFormat,
    StyleScope, Workbook,
};

fn three_sheet_workbook() -> Workbook {
    let mut book = Workbook::new();
    book.rename_sheet(0, "Q1");
    book.add_sheet("Q2");
    book.add_sheet("Q3");
    book
}

#[test]
fn grouped_cell_input_writes_all_grouped_sheets_and_undoes_in_one_step() {
    let mut book = three_sheet_workbook();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "10").unwrap();
    book.set_cell_input(1, "A1", "20").unwrap();
    book.set_cell_input(2, "A1", "30").unwrap();

    history
        .set_cell_input_sheets(&mut book, &[0, 2], "B1", "=A1*2", true)
        .unwrap();

    assert_eq!(book.get_cell("Q1", "B1"), Value::Number(20.0));
    assert_eq!(book.get_cell("Q2", "B1"), Value::Null);
    assert_eq!(book.get_cell("Q3", "B1"), Value::Number(60.0));
    assert_eq!(history.undo_count(), 1);

    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Q1", "B1"), Value::Null);
    assert_eq!(book.get_cell("Q3", "B1"), Value::Null);

    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Q1", "B1"), Value::Number(20.0));
    assert_eq!(book.get_cell("Q3", "B1"), Value::Number(60.0));
}

#[test]
fn grouped_cell_input_rolls_back_all_sheets_when_a_later_sheet_fails_validation_or_protection() {
    let mut book = three_sheet_workbook();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "initial-1").unwrap();
    book.set_cell_input(1, "A1", "initial-2").unwrap();

    // Sheet 1 has a stop validation requiring whole numbers >= 100 on A1.
    let a1 = CellRange::single(CellAddress::new(0, 0));
    book.sheet_mut(1)
        .unwrap()
        .set_data_validation(
            a1,
            Some(DataValidationRule {
                kind: DataValidationKind::WholeNumber {
                    min: 100.0,
                    max: 200.0,
                },
                ignore_blank: true,
                operator: DataValidationOperator::GreaterThanOrEqual,
                options: AdvancedValidationOptions::default(),
            }),
        )
        .unwrap();

    let err = history
        .set_cell_input_sheets(&mut book, &[0, 1], "A1", "50", true)
        .unwrap_err();
    assert_eq!(err, "DATA_VALIDATION_FAILED");
    assert_eq!(book.get_cell("Q1", "A1"), Value::Text("initial-1".into()));
    assert_eq!(book.get_cell("Q2", "A1"), Value::Text("initial-2".into()));
    assert_eq!(history.undo_count(), 0);

    // Protect sheet 2 and ensure preflight rejects before touching sheet 0.
    book.change_protection(2, ProtectionChange::Protect).unwrap();
    let err = history
        .set_cell_input_sheets(&mut book, &[0, 2], "A1", "200", true)
        .unwrap_err();
    assert!(err.contains("locked") || err.contains("PROTECTED"));
    assert_eq!(book.get_cell("Q1", "A1"), Value::Text("initial-1".into()));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn grouped_clear_and_format_apply_atomically_across_grouped_sheets_with_single_undo() {
    let mut book = three_sheet_workbook();
    let mut history = WorkbookHistory::default();
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));

    for sheet in [0, 1, 2] {
        book.set_cell_input(sheet, "A1", "12").unwrap();
        book.set_cell_input(sheet, "A2", "34").unwrap();
    }

    // Format sheets 0 and 1 together.
    history
        .patch_format_selection_sheets(
            &mut book,
            0,
            &[0, 1],
            &[(range, StyleScope::Cell)],
            CellStyle {
                bold: Some(true),
                number_format: Some(NumberFormat::Percent { digits: 1 }),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(book.sheet(0).unwrap().get_format("A1").bold);
    assert!(book.sheet(1).unwrap().get_format("A2").bold);
    assert!(!book.sheet(2).unwrap().get_format("A1").bold);
    assert_eq!(history.undo_count(), 1);

    // Borders across sheets 0 and 1.
    history
        .patch_range_borders_sheets(
            &mut book,
            0,
            &[0, 1],
            range,
            BorderPreset::All,
            BorderSpec {
                style: BorderStyle::Thin,
                color: Some("#7f7f7f".into()),
            },
        )
        .unwrap();
    assert_eq!(
        book.sheet(0)
            .unwrap()
            .get_format("A1")
            .borders
            .top
            .map(|b| b.style),
        Some(BorderStyle::Thin)
    );
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .get_format("A2")
            .borders
            .bottom
            .map(|b| b.style),
        Some(BorderStyle::Thin)
    );
    assert_eq!(book.sheet(2).unwrap().get_format("A1").borders.top, None);
    assert_eq!(history.undo_count(), 2);

    // Clear contents across sheets 0 and 1.
    history
        .clear_selection_sheets(
            &mut book,
            0,
            &[0, 1],
            &[(range, StyleScope::Cell)],
            ClearSelectionMode::Contents,
        )
        .unwrap();
    assert_eq!(book.get_cell("Q1", "A1"), Value::Null);
    assert_eq!(book.get_cell("Q2", "A2"), Value::Null);
    assert_eq!(book.get_cell("Q3", "A1"), Value::Number(12.0));
    assert_eq!(history.undo_count(), 3);

    // Undo clear -> restores values on both Q1 and Q2 in one step.
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Q1", "A1"), Value::Number(12.0));
    assert_eq!(book.get_cell("Q2", "A2"), Value::Number(34.0));

    // Undo borders -> removes borders on both Q1 and Q2 in one step.
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("A1").borders.top, None);
    assert_eq!(book.sheet(1).unwrap().get_format("A2").borders.bottom, None);

    // Undo format -> removes bold on both Q1 and Q2 in one step.
    history.undo(&mut book).unwrap();
    assert!(!book.sheet(0).unwrap().get_format("A1").bold);
    assert!(!book.sheet(1).unwrap().get_format("A2").bold);
}

#[test]
fn grouped_clear_and_format_reject_if_any_grouped_sheet_has_partial_merge() {
    let mut book = three_sheet_workbook();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "keep").unwrap();
    book.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );
    // Merge A1:B1 on sheet 1 only.
    book.sheet_mut(1)
        .unwrap()
        .restore_merged_ranges(vec![CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(0, 1),
        )])
        .unwrap();

    let single_a1 = CellRange::single(CellAddress::new(0, 0));
    assert_eq!(
        history.clear_selection_sheets(
            &mut book,
            0,
            &[0, 1],
            &[(single_a1, StyleScope::Cell)],
            ClearSelectionMode::All,
        ),
        Err("Select the entire merged cell before clearing.")
    );
    assert_eq!(book.get_cell("Q1", "A1"), Value::Text("keep".into()));
    assert!(book.sheet(0).unwrap().get_format("A1").italic);
    assert_eq!(history.undo_count(), 0);
}
