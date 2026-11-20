use einfach_core::Value;
use einfach_excel_core::advanced_filter::{
    AdvancedFilterCopy, AdvancedFilterSelection, FilterOverwriteApproval, FilterRangeRef,
    PersistedCriteriaRange,
};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, FilterError, NumberFormat, Workbook};

fn address(cell: &str) -> CellAddress {
    CellAddress::parse(cell).unwrap()
}

fn reference(sheet: usize, start: &str, end: &str) -> FilterRangeRef {
    FilterRangeRef {
        sheet,
        range: CellRange::new(address(start), address(end)),
    }
}

fn text(value: &str) -> Value {
    Value::Text(value.into())
}

#[test]
fn worksheet_conditions_keep_typed_ranges_prefixes_and_disjunctive_rows() {
    let mut book = Workbook::new();
    for (cell, label) in [
        ("B3", "Name"),
        ("C3", "Score"),
        ("H2", "name"),
        ("I2", "Score"),
        ("J2", "Score"),
        ("H3", "ALP"),
        ("I3", ">=4"),
        ("J3", "<=9"),
        ("H4", "=Beta"),
        ("H5", "Q?~*"),
    ] {
        book.set_cell(0, cell, text(label));
    }
    for (row, name, score) in [
        (4, "Alpha", Value::Number(8.0)),
        (5, "Alpine", Value::Number(10.0)),
        (6, "alpine", text("6")),
        (7, "Beta", Value::Number(1.0)),
        (8, "Betamax", Value::Number(6.0)),
        (9, "Qx*", Value::Null),
        (10, "QxZ", Value::Number(6.0)),
    ] {
        book.set_cell(0, &format!("B{row}"), text(name));
        book.set_cell(0, &format!("C{row}"), score);
    }
    let selection = AdvancedFilterSelection {
        source: reference(0, "B3", "C10"),
        criteria: Some(reference(0, "H2", "J5")),
        unique_only: false,
    };
    let applied = book.apply_advanced_filter_range(selection).unwrap();
    assert_eq!(applied.hidden_rows, [4, 5, 7, 9]);
    assert_eq!(applied.scanned_rows, 7);
    let saved = book.snapshot_filters();
    book.set_cell(0, "I3", text(">=9"));
    assert_eq!(book.snapshot_filters(), saved);
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [3, 4, 5, 7, 9]);
    book.restore_filters(saved).unwrap();
    assert_eq!(book.filter_hidden_rows(0), [4, 5, 7, 9]);
    book.set_cell(0, "H2", text("Unknown"));
    assert!(matches!(
        book.reapply_filter(0),
        Err(FilterError::InvalidCriteria(_))
    ));
    assert_eq!(book.filter_hidden_rows(0), [4, 5, 7, 9]);
}

#[test]
fn relative_formula_criteria_follow_records_with_saved_sheet_identity() {
    let mut book = Workbook::new();
    let criteria_sheet = book.add_sheet("Filter Rules");
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "C2", text("Score"));
    for (cell, score) in [("C3", 1.0), ("C4", 4.0), ("C5", 7.0)] {
        book.set_cell(0, cell, Value::Number(score));
    }
    book.set_cell(criteria_sheet, "B2", text("Formula criteria"));
    book.set_cell(criteria_sheet, "F5", Value::Number(4.0));
    assert!(book.set_formula(criteria_sheet, "B3", "=Sheet1!C3>=$F$5"));
    let selection = AdvancedFilterSelection {
        source: reference(0, "C2", "C5"),
        criteria: Some(reference(criteria_sheet, "B2", "B3")),
        unique_only: false,
    };
    assert_eq!(
        history
            .apply_advanced_filter_range(&mut book, selection)
            .unwrap()
            .hidden_rows,
        [2]
    );
    assert!(book.rename_sheet(criteria_sheet, "Renamed Rules"));
    book.set_cell(criteria_sheet, "F5", Value::Number(6.0));
    assert_eq!(
        history.reapply_filter(&mut book, 0).unwrap().hidden_rows,
        [2, 3]
    );
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.filter_hidden_rows(0), [2]);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.filter_hidden_rows(0), [2, 3]);
    book.remove_sheet(criteria_sheet).unwrap();
    book.add_sheet("Renamed Rules");
    assert_eq!(
        book.filter_range_criteria(0).unwrap().criteria,
        Some(PersistedCriteriaRange::Missing)
    );
    assert!(book.reapply_filter(0).is_err());
    assert_eq!(book.filter_hidden_rows(0), [2, 3]);
}

#[test]
fn copy_preserves_full_record_uniqueness_types_output_order_and_undo() {
    let mut book = Workbook::new();
    let output = book.add_sheet("Copied rows");
    let mut history = WorkbookHistory::default();
    for (cell, value) in [
        ("A1", "Name"),
        ("B1", "Day"),
        ("C1", "Paid"),
        ("A2", "Alpha"),
        ("A3", "ALPHA"),
        ("A4", "Alpha"),
        ("A5", "Alpha"),
    ] {
        book.set_cell(0, cell, text(value));
    }
    for row in 2..=5 {
        let day = if row == 5 {
            text("45600")
        } else {
            Value::Number(45600.0)
        };
        book.set_cell(0, &format!("B{row}"), day);
        book.set_cell(0, &format!("C{row}"), Value::Boolean(row != 4));
    }
    let date = NumberFormat::Date("yyyy-mm-dd".into());
    book.sheet_mut(0).unwrap().set_format(
        "B2",
        CellFormat {
            number_format: date.clone(),
            ..Default::default()
        },
    );
    assert!(book.set_formula(0, "B4", "=45600"));
    book.set_cell(output, "D3", text("Keep on rejection"));
    let request = AdvancedFilterCopy {
        selection: AdvancedFilterSelection {
            source: reference(0, "A1", "C5"),
            criteria: None,
            unique_only: true,
        },
        sheet: output,
        destination: address("D2"),
        output_fields: vec!["Day".into(), "Name".into()],
        row_count: 40,
        col_count: 10,
    };
    let preview = book.preview_advanced_filter_copy(&request).unwrap();
    assert_eq!(preview.matched_rows, 3);
    assert_eq!(preview.target, reference(output, "D2", "E5").range);
    assert_eq!(preview.overwritten_cells, 1);
    assert_eq!(preview.sample[0], ["Day", "Name"]);
    assert!(history
        .copy_advanced_filter(&mut book, &request, None)
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(
        book.get_cell("Copied rows", "D3"),
        text("Keep on rejection")
    );
    let approval = FilterOverwriteApproval {
        target: preview.target,
        count: 1,
    };
    let report = history
        .copy_advanced_filter(&mut book, &request, Some(approval))
        .unwrap();
    assert_eq!(report.matched_rows, 3);
    assert_eq!(book.get_cell("Copied rows", "D3"), Value::Number(45600.0));
    assert_eq!(book.get_cell("Copied rows", "D4"), Value::Number(45600.0));
    assert_eq!(book.get_cell("Copied rows", "D5"), text("45600"));
    assert_eq!(
        book.sheet(output).unwrap().get_format("D3").number_format,
        date
    );
    assert!(book.sheet(output).unwrap().get_formula("D4").is_none());
    assert_eq!(
        book.sheet(0).unwrap().get_formula("B4").as_deref(),
        Some("=45600")
    );
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(
        book.get_cell("Copied rows", "D3"),
        text("Keep on rejection")
    );
    assert_eq!(book.get_cell("Copied rows", "D4"), Value::Null);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Copied rows", "D5"), text("45600"));
}

#[test]
fn shifting_criteria_on_another_sheet_keeps_the_range_and_history_in_sync() {
    let mut book = Workbook::new();
    let criteria_sheet = book.add_sheet("Criteria");
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", text("Name"));
    book.set_cell(0, "A2", text("Alpha"));
    book.set_cell(0, "A3", text("Beta"));
    book.set_cell(criteria_sheet, "A1", text("Name"));
    book.set_cell(criteria_sheet, "A2", text("Al"));
    let selection = AdvancedFilterSelection {
        source: reference(0, "A1", "A3"),
        criteria: Some(reference(criteria_sheet, "A1", "A2")),
        unique_only: false,
    };
    history
        .apply_advanced_filter_range(&mut book, selection)
        .unwrap();
    let current_criteria = |book: &Workbook| book.filter_range_criteria(0).unwrap().criteria;
    assert!(history
        .edit_structure(
            &mut book,
            criteria_sheet,
            ShiftEdit::RowInsert { at: 0, count: 2 }
        )
        .unwrap());
    assert_eq!(
        current_criteria(&book),
        Some(PersistedCriteriaRange::Range(reference(
            criteria_sheet,
            "A3",
            "A4"
        )))
    );
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [2]);
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(
        current_criteria(&book),
        selection.criteria.map(PersistedCriteriaRange::Range)
    );
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(
        current_criteria(&book),
        Some(PersistedCriteriaRange::Range(reference(
            criteria_sheet,
            "A3",
            "A4"
        )))
    );
    assert!(history
        .edit_structure(
            &mut book,
            criteria_sheet,
            ShiftEdit::RowDelete { at: 2, count: 1 }
        )
        .unwrap());
    assert_eq!(
        current_criteria(&book),
        Some(PersistedCriteriaRange::Missing)
    );
    assert!(book.reapply_filter(0).is_err());
    assert_eq!(book.filter_hidden_rows(0), [2]);
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, [2]);
}

#[test]
fn criteria_trims_operator_whitespace_and_oversized_shift_marks_criteria_missing() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", text("Amount"));
    book.set_cell(0, "A2", Value::Number(5.0));
    book.set_cell(0, "A3", Value::Number(25.0));
    book.set_cell(0, "D1", text("Amount"));
    book.set_cell(0, "D2", text("> 10"));
    let selection = AdvancedFilterSelection {
        source: reference(0, "A1", "A3"),
        criteria: Some(reference(0, "D1", "D2")),
        unique_only: false,
    };
    let report = history
        .apply_advanced_filter_range(&mut book, selection)
        .unwrap();
    assert_eq!(report.hidden_rows, [1]);
    // Inserting 1025 rows inside D1:D2 would exceed MAX_CRITERIA_CELLS (1024), so link becomes Missing
    // instead of storing an unrestorable oversized range.
    assert!(history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 1025 })
        .unwrap());
    assert_eq!(
        book.filter_range_criteria(0).unwrap().criteria,
        Some(PersistedCriteriaRange::Missing)
    );
    let snapshot = book.snapshot_filters();
    book.restore_filters(snapshot).unwrap();
}
