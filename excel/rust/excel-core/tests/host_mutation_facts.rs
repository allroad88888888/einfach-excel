use einfach_core::Value;
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}

#[test]
fn host_facts_track_cross_sheet_cut_source_destination_and_rewritten_reference() {
    let mut book = Workbook::new();
    book.add_sheet("Target");
    book.add_sheet("Audit");
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(2, "J30", "=Sheet1!A1");
    let clipboard = book.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clipboard, 1,
        &ClipboardPasteOptions::new(range("C4", "C4")), &mut history).unwrap();
    let fact = history.last_mutation().unwrap();
    assert_eq!(fact.sequence, 1);
    let expected = [(0, range("A1", "A1")), (1, range("C4", "C4")), (2, range("J30", "J30"))];
    for (sheet, expected) in expected {
        let key = book.sheet_key(sheet).unwrap();
        let ranges = &fact.changes.iter().find(|(actual, _)| *actual == key).unwrap().1;
        assert!(ranges.iter().any(|range| range.contains(expected.start)));
    }
    let committed = fact.changes.clone();
    history.undo(&mut book).unwrap();
    assert_eq!(history.last_mutation().unwrap().sequence, 2);
    assert_eq!(history.last_mutation().unwrap().changes, committed);
    history.redo(&mut book).unwrap();
    assert_eq!(history.last_mutation().unwrap().sequence, 3);
    assert_eq!(history.last_mutation().unwrap().changes, committed);
}

#[test]
fn host_facts_survive_history_eviction_clear_and_noop_without_using_history_length() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for value in 0..65 { history.set_cell_input(&mut book, 0, "A1", &value.to_string()).unwrap(); }
    assert_eq!(history.undo_count(), 50);
    assert_eq!(history.mutation_sequence(), 65);
    history.set_cell_input(&mut book, 0, "A1", "64").unwrap();
    assert_eq!(history.mutation_sequence(), 65);
    assert!(history.set_cell_input(&mut book, 0, "A1", "=A1").is_err());
    assert_eq!(history.mutation_sequence(), 65);
    history.clear("");
    assert_eq!(history.mutation_sequence(), 65);
    history.set_cell_input(&mut book, 0, "B8", "next").unwrap();
    assert_eq!(history.mutation_sequence(), 66);
    assert_eq!(history.last_mutation().unwrap().changes,
        vec![(book.sheet_key(0).unwrap(), vec![range("B8", "B8")])]);
}

#[test]
fn host_facts_include_structural_rewrites_at_their_own_cross_sheet_positions() {
    let mut book = Workbook::new();
    book.add_sheet("Audit");
    book.add_sheet("Untouched");
    book.set_cell(0, "A3", Value::Number(4.));
    book.set_formula(1, "J30", "=Sheet1!A3");
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0,
        einfach_excel_core::shift::ShiftEdit::RowInsert { at: 1, count: 1 }).unwrap();
    let fact = history.last_mutation().unwrap();
    assert!(fact.changes.iter().find(|(key, _)| Some(*key) == book.sheet_key(1)).unwrap().1
        .contains(&range("J30", "J30")));
    history.edit_sheet(&mut book, Some(0), "Renamed").unwrap();
    assert!(history.last_mutation().unwrap().changes.iter()
        .find(|(key, _)| Some(*key) == book.sheet_key(1)).unwrap().1.contains(&range("J30", "J30")));
    assert!(!history.last_mutation().unwrap().changes.iter()
        .any(|(key, _)| Some(*key) == book.sheet_key(2)));
}

#[test]
fn host_facts_bound_sparse_clear_to_actual_changed_positions_instead_of_the_whole_selection() {
    let mut book = Workbook::new();
    book.set_cell(0, "D100", Value::Number(5.));
    let mut history = WorkbookHistory::default();
    history.clear_selection(&mut book, 0, &[(range("A1", "XFD1048576"),
        einfach_excel_core::StyleScope::Cell)],
        einfach_excel_core::workbook_history::ClearSelectionMode::Contents).unwrap();
    assert_eq!(history.last_mutation().unwrap().changes,
        vec![(book.sheet_key(0).unwrap(), vec![range("D100", "D100")])]);
}

#[test]
fn host_facts_omit_noop_sheet_targets_and_do_not_invent_cells_for_global_definitions() {
    use einfach_excel_core::custom_formulas::{CustomFormulaAction, CustomFormulaDefinition};
    use einfach_excel_core::host::{HostCellInput, HostCellWrite, RawCellValue};
    let mut book = Workbook::new();
    book.add_sheet("Untouched");
    let mut history = WorkbookHistory::default();
    history.write_host_cells(&mut book, &[
        HostCellWrite { sheet: 0, row: 5, col: 3,
            input: HostCellInput::Literal { value: RawCellValue::Number { value: 8. } } },
        HostCellWrite { sheet: 1, row: 0, col: 0,
            input: HostCellInput::Literal { value: RawCellValue::Blank } },
    ]).unwrap();
    assert_eq!(history.last_mutation().unwrap().changes,
        vec![(book.sheet_key(0).unwrap(), vec![range("D6", "D6")])]);
    history.change_custom_formula(&mut book, 0, CustomFormulaAction::Upsert {
        definition: CustomFormulaDefinition { name: "TWICE".into(), parameters: vec!["x".into()],
            expression: "=x*2".into() },
    }).unwrap();
    assert!(history.last_mutation().unwrap().changes.is_empty());
}
