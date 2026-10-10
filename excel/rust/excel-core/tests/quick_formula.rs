use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_quick_formula::QuickFormula;
use einfach_core::Value;

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn book() -> Workbook {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "A2", Value::Number(2.0));
    book.set_cell(0, "A3", Value::Number(4.0));
    book.set_formula(0, "A4", "=A2+A3");
    book
}

#[test]
fn blank_destination_infers_contiguous_numeric_formulas_above_without_mutation() {
    let book = book();
    for (function, name) in [(QuickFormula::Sum, "SUM"), (QuickFormula::Average, "AVERAGE"), (QuickFormula::Count, "COUNT")] {
        let plan = book.suggest_quick_formula(0, range("A5", "A5"), 100, 8, function).unwrap();
        assert_eq!(plan.source, range("A2", "A4"));
        assert_eq!(plan.target, CellAddress::parse("A5").unwrap());
        assert_eq!(plan.input, format!("={name}(A2:A4)"));
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
    }
}

#[test]
fn horizontal_source_uses_right_blank_and_text_is_not_an_inferred_number() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Text("10".into()));
    book.set_cell(0, "B2", Value::Number(3.0));
    book.set_cell(0, "C2", Value::Number(5.0));
    let plan = book.suggest_quick_formula(0, range("D2", "D2"), 100, 8, QuickFormula::Sum).unwrap();
    assert_eq!(plan.input, "=SUM(B2:C2)");
    for source in [range("B2", "C2"), range("B2", "D2")] {
        assert_eq!(book.suggest_quick_formula(0, source, 100, 8, QuickFormula::Sum).unwrap(), plan);
    }
}

#[test]
fn explicit_ranges_use_one_summary_and_reuse_an_empty_trailing_row() {
    let mut book = book();
    for source in [range("A2", "A4"), range("A2", "A5")] {
        let plan = book.suggest_quick_formula(0, source, 100, 8, QuickFormula::Average).unwrap();
        assert_eq!(plan.input, "=AVERAGE(A2:A4)");
        assert_eq!(plan.target, CellAddress::parse("A5").unwrap());
    }
    book.set_cell(0, "B2", Value::Number(8.0));
    let plan = book.suggest_quick_formula(0, range("A2", "B5"), 100, 8, QuickFormula::Count).unwrap();
    assert_eq!(plan.input, "=COUNT(A2:B4)");
    assert_eq!(plan.target, CellAddress::parse("A5").unwrap());
}

#[test]
fn occupied_result_and_empty_string_formula_are_never_overwritten() {
    let mut book = book();
    book.set_cell(0, "A5", Value::Text(String::new()));
    assert!(book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).is_err());
    book.set_formula(0, "A5", "=IF(TRUE,\"\",0)");
    assert!(book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).is_err());
    assert_eq!(book.sheet(0).unwrap().get_formula("A5").unwrap(), "=IF(TRUE,\"\",0)");
}

#[test]
fn no_numeric_neighbour_unknown_sheet_and_invalid_canvas_reject_read_only() {
    let book = book();
    for (sheet, selected, rows, cols) in [
        (0, range("H100", "H100"), 100, 8), (1, range("A2", "A4"), 100, 8),
        (0, range("A2", "A4"), 4, 8), (0, range("A2", "A4"), 0, 8),
        (0, range("A1", "XFD1048576"), 1048576, 16384),
        (0, CellRange::new(CellAddress::new(5, 1), CellAddress::new(1, 0)), 100, 8),
    ] {
        assert!(book.suggest_quick_formula(sheet, selected, rows, cols, QuickFormula::Sum).is_err());
    }
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(6.0));
}

#[test]
fn proposals_feed_the_existing_edit_history_and_recalculate_on_source_changes() {
    for (function, expected) in [(QuickFormula::Sum, 12.0), (QuickFormula::Average, 4.0), (QuickFormula::Count, 3.0)] {
        let mut book = book();
        let plan = book.suggest_quick_formula(0, range("A5", "A5"), 100, 8, function).unwrap();
        let mut history = WorkbookHistory::default();
        history.begin(&book, 0, CellRange::single(plan.target), "Edit A5", true).unwrap();
        book.set_cell_input(0, "A5", &plan.input).unwrap();
        history.finish(&mut book, true).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(expected));
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
        history.redo(&mut book).unwrap();
        book.set_cell(0, "A2", Value::Number(8.0));
        let changed = match function { QuickFormula::Sum => 24.0, QuickFormula::Average => 8.0, QuickFormula::Count => 3.0 };
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(changed));
    }
}

#[test]
fn merged_sources_results_and_spill_results_are_rejected_without_mutation() {
    use einfach_excel_core::MergeAction;
    let mut book = book();
    book.merge_cells(0, range("A5", "B5"), MergeAction::Merge, false).unwrap();
    assert!(book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).is_err());
    assert!(book.suggest_quick_formula(0, range("A5", "A5"), 100, 8, QuickFormula::Sum).is_err());
    book.merge_cells(0, range("A5", "B5"), MergeAction::Unmerge, false).unwrap();
    book.set_formula(0, "A5", "=SEQUENCE(2)");
    assert_eq!(book.get_cell("Sheet1", "A6"), Value::Number(2.0));
    book.sheet_mut(0).unwrap().set_array("D1", std::sync::Arc::new(
        einfach_core::ArrayData::new(1, 3, vec![Value::Number(1.0), Value::Null, Value::Null]),
    )).unwrap();
    let error = book.suggest_quick_formula(0, range("E1", "F1"), 100, 8, QuickFormula::Sum).unwrap_err();
    assert!(error.contains("spilled result"));
    assert!(book.suggest_quick_formula(0, range("A6", "A6"), 6, 8, QuickFormula::Sum).is_err());
    assert_eq!(book.get_cell("Sheet1", "A6"), Value::Number(2.0));
}

#[test]
fn hidden_result_is_rejected_but_hidden_source_keeps_normal_sum_semantics() {
    let mut book = book();
    book.hide_rows(0, &[4]);
    assert!(book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).unwrap_err().contains("Unhide"));
    book.unhide_rows(0, &[4]);
    book.set_eval_filter_hidden_rows(0, &[4]);
    assert!(book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).is_err());
    book.set_eval_filter_hidden_rows(0, &[2]);
    let plan = book.suggest_quick_formula(0, range("A2", "A4"), 100, 8, QuickFormula::Sum).unwrap();
    book.set_cell_input(0, "A5", &plan.input).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(12.0));
}

#[test]
fn numeric_inference_stops_at_blanks_errors_and_text_and_prefers_above() {
    let mut book = Workbook::new();
    book.set_cell(0, "B1", Value::Number(100.0));
    book.set_cell(0, "B3", Value::Number(3.0));
    book.set_cell(0, "A4", Value::Number(9.0));
    assert_eq!(book.suggest_quick_formula(0, range("B4", "B4"), 100, 8, QuickFormula::Sum).unwrap().input, "=SUM(B3:B3)");
    book.set_formula(0, "B3", "=1/0");
    assert_eq!(book.suggest_quick_formula(0, range("B4", "B4"), 100, 8, QuickFormula::Sum).unwrap().input, "=SUM(A4:A4)");
}
