use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, FindLookIn, FindQuery, Workbook};

fn all() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_575, 16_383))
}
fn query(needle: &str) -> FindQuery {
    FindQuery {
        needle: needle.into(),
        case_sensitive: false,
        whole_cell: false,
        look_in: FindLookIn::Formulas,
    }
}
fn value(wb: &Workbook, sheet: usize, address: &str) -> Value {
    wb.get_cell(wb.name(sheet).unwrap(), address)
}

#[test]
fn replace_all_exceeds_page_limit_and_undoes_across_sheets_in_one_step() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.add_sheet("Other");
    for sheet in 0..2 {
        for row in 1..=300 {
            wb.set_cell(sheet, &format!("A{row}"), Value::Text("old old".into()));
        }
    }
    let report = history
        .replace_by_query(
            &mut wb,
            &[(0, all()), (1, all())],
            &query("old"),
            "new",
            None,
        )
        .unwrap();
    assert_eq!((report.cells, report.occurrences), (600, 1200));
    assert_eq!(history.undo_count(), 1);
    assert_eq!(value(&wb, 1, "A300"), Value::Text("new new".into()));
    history.undo(&mut wb).unwrap();
    assert_eq!(value(&wb, 0, "A1"), Value::Text("old old".into()));
    assert_eq!(value(&wb, 1, "A300"), Value::Text("old old".into()));
    history.redo(&mut wb).unwrap();
    assert_eq!(value(&wb, 1, "A300"), Value::Text("new new".into()));
}

#[test]
fn replace_current_uses_the_exact_unicode_occurrence_not_every_match_in_the_cell() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("😀Éé".into()));
    let q = query("é");
    let page = wb.find_cells(&[(0, all())], &q, 0, 10).unwrap();
    let current = &page.matches[1];
    let report = history
        .replace_by_query(&mut wb, &[(0, all())], &q, "中", Some(current))
        .unwrap();
    assert_eq!((report.cells, report.occurrences), (1, 1));
    assert_eq!(value(&wb, 0, "A1"), Value::Text("😀É中".into()));
    assert!(history
        .replace_by_query(&mut wb, &[(0, all())], &q, "中", Some(current))
        .is_err());
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn text_remains_text_and_replacement_is_not_recursively_searched() {
    for replacement in ["00123", "=1+2", "TRUE", "'quoted", "oldold", ""] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text("old".into()));
        let report = history
            .replace_by_query(&mut wb, &[(0, all())], &query("old"), replacement, None)
            .unwrap();
        assert_eq!(report.occurrences, 1);
        assert_eq!(
            value(&wb, 0, "A1"),
            if replacement.is_empty() {
                Value::Null
            } else {
                Value::Text(replacement.into())
            }
        );
        assert_eq!(wb.sheet(0).unwrap().get_formula("A1"), None);
    }
}

#[test]
fn no_op_does_not_add_history_or_destroy_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("old".into()));
    history
        .replace_by_query(&mut wb, &[(0, all())], &query("old"), "new", None)
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(
        history
            .replace_by_query(&mut wb, &[(0, all())], &query("old"), "old", None)
            .unwrap()
            .cells,
        0
    );
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
}

#[test]
fn late_invalid_formula_rolls_back_prior_writes_and_style_changes() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("SUM".into()));
    wb.set_formula(0, "A2", "=SUM(1,2)");
    wb.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    let original_format = wb.sheet(0).unwrap().effective_format("A1");
    assert!(history
        .replace_by_query(&mut wb, &[(0, all())], &query("SUM"), "(", None)
        .is_err());
    assert_eq!(value(&wb, 0, "A1"), Value::Text("SUM".into()));
    assert_eq!(value(&wb, 0, "A2"), Value::Number(3.0));
    assert_eq!(wb.sheet(0).unwrap().effective_format("A1"), original_format);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn late_formula_cycle_rolls_back_all_formulas() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_formula(0, "A1", "=2+1");
    wb.set_formula(0, "A2", "=3+1");
    assert!(history
        .replace_by_query(&mut wb, &[(0, all())], &query("+1"), "+A2", None)
        .is_err());
    assert_eq!(wb.sheet(0).unwrap().get_formula("A1").unwrap(), "=2+1");
    assert_eq!(wb.sheet(0).unwrap().get_formula("A2").unwrap(), "=3+1");
    assert_eq!(value(&wb, 0, "A1"), Value::Number(3.0));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn formula_replacement_recalculates_dependents_and_preserves_source_on_undo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.add_sheet("Other");
    wb.set_formula(0, "A1", "=1+2");
    wb.set_formula(1, "B1", "=Sheet1!A1*2");
    history
        .replace_by_query(&mut wb, &[(0, all())], &query("1+2"), "4+5", None)
        .unwrap();
    assert_eq!(value(&wb, 1, "B1"), Value::Number(18.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(value(&wb, 1, "B1"), Value::Number(6.0));
}

#[test]
fn searching_formula_results_does_not_authorize_destroying_formulas() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("found".into()));
    wb.set_formula(0, "A2", "=\"found\"");
    let q = FindQuery {
        look_in: FindLookIn::Values,
        ..query("found")
    };
    assert!(history
        .replace_by_query(&mut wb, &[(0, all())], &q, "lost", None)
        .is_err());
    assert_eq!(value(&wb, 0, "A1"), Value::Text("found".into()));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("A2").unwrap(),
        "=\"found\""
    );
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn replacement_expansion_is_rejected_before_allocating_or_mutating() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("a".repeat(20)));
    assert!(history
        .replace_by_query(
            &mut wb,
            &[(0, all())],
            &query("a"),
            &"b".repeat(1_048_576),
            None
        )
        .is_err());
    assert_eq!(value(&wb, 0, "A1"), Value::Text("a".repeat(20)));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn raw_numeric_search_preserves_full_precision_and_existing_format() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Number(1.23456789012345));
    let q = query("1.23456789012345");
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 1);
    history
        .replace_by_query(&mut wb, &[(0, all())], &q, "9.87654321098765", None)
        .unwrap();
    assert_eq!(value(&wb, 0, "A1"), Value::Number(9.87654321098765));
    history.undo(&mut wb).unwrap();
    assert_eq!(value(&wb, 0, "A1"), Value::Number(1.23456789012345));
}

#[test]
fn replacing_a_spill_child_cannot_turn_it_into_a_literal() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "B1", Value::Text("8".into()));
    wb.set_formula(0, "A2", "=SEQUENCE(2,1,7)");
    assert_eq!(value(&wb, 0, "A3"), Value::Number(8.0));
    let q = query("8");
    let found = wb.find_cells(&[(0, all())], &q, 0, 10).unwrap();
    assert_eq!(found.total, 2);
    assert!(history
        .replace_by_query(&mut wb, &[(0, all())], &q, "9", None)
        .is_err());
    assert_eq!(value(&wb, 0, "B1"), Value::Text("8".into()));
    assert_eq!(value(&wb, 0, "A3"), Value::Number(8.0));
    assert_eq!(history.undo_count(), 0);
}
