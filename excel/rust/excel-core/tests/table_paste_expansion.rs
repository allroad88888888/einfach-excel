//! 粘贴扩表必须连同实际值、计算列及结构化引用进入一条历史。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Qty".into()));
    book.set_cell(0, "B1", Value::Text("Amount".into()));
    book.set_cell(0, "A2", Value::Number(2.));
    book.set_cell(0, "B2", Value::Number(4.));
    book.define_table(Some("Orders"), 0, range("A1", "B2"), true).unwrap();
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=SUM(Orders[Amount])");
    book.set_formula(1, "B1", "=Orders[Qty]");
    (book, WorkbookHistory::default())
}
fn paste(book: &mut Workbook, history: &mut WorkbookHistory, address: &str, text: &str) {
    let clip = ClipboardSnapshot::from_tsv(text, ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&clip, 0,
        &ClipboardPasteOptions::new(range(address, address)), history).unwrap();
}

#[test]
fn multiple_rows_expand_once_and_update_cross_sheet_arrays() {
    let (mut book, mut history) = seed();
    let original = book.snapshot_tables();
    paste(&mut book, &mut history, "A3", "3\t6\n4\t8");
    for _ in 0..2 {
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B4"));
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(18.));
        assert_eq!(book.get_cell("Report", "B3"), Value::Number(4.));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Report", "B3"), Value::Null);
        history.redo(&mut book).unwrap();
    }
}

#[test]
fn downward_extra_columns_stay_outside_the_table() {
    let (mut book, mut history) = seed();
    paste(&mut book, &mut history, "A3", "3\t6\t99\n4\t8\t88");
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B4"));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(88.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Null);
}

#[test]
fn right_hand_columns_get_unique_literal_headers_and_one_history() {
    let (mut book, mut history) = seed();
    let original = book.snapshot_tables();
    paste(&mut book, &mut history, "C1", "Qty\t=1+1\n7\t8");
    let table = book.get_table("Orders").unwrap();
    assert_eq!(table.range(), range("A1", "D2"));
    assert_eq!(table.columns(), &["Qty", "Amount", "Column1", "=1+1"]);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("Column1".into()));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Text("=1+1".into()));
    assert!(book.sheet(0).unwrap().formula_text_at(CellAddress::parse("D1").unwrap()).is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "D2"), Value::Number(8.));
}

#[test]
fn new_rows_inherit_calculated_columns_without_overwriting_pasted_exceptions() {
    let (mut book, mut setup) = seed();
    setup.set_cell_input(&mut book, 0, "B2", "=[@Qty]*2").unwrap();
    let mut history = WorkbookHistory::default();
    paste(&mut book, &mut history, "A3", "3\n4");
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(6.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(8.));
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(18.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B2"));
    paste(&mut book, &mut history, "A3", "3\t99\n4\t");
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(99.));
    // 明确粘入空白也是用户输入，不用模板覆盖它。
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
}

#[test]
fn format_only_blank_and_protected_pastes_do_not_expand() {
    let (mut book, mut history) = seed();
    let original = book.snapshot_tables();
    let clip = book.capture_clipboard(0, range("A2", "B2"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("A3", "A3"));
    options.mode = ClipboardPasteMode::Formats;
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    paste(&mut book, &mut history, "A3", "\t");
    assert_eq!(book.snapshot_tables(), original);
    options.mode = ClipboardPasteMode::All;
    options.unlocked_ranges = Some(vec![range("A3", "B3")]);
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
}

#[test]
fn rejected_array_paste_restores_geometry_values_and_redo() {
    for recorded in [false, true] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "F1", "77").unwrap();
        history.undo(&mut book).unwrap();
        let original = book.snapshot_tables();
        let clip = ClipboardSnapshot::from_tsv("=SEQUENCE(2)", ClipboardPasteMode::All).unwrap();
        let options = ClipboardPasteOptions::new(range("A3", "A3"));
        let result = if recorded {
            book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        } else { book.paste_clipboard(&clip, 0, &options) };
        assert!(result.is_err());
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "A4"), Value::Null);
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(4.));
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    }
}

#[test]
fn failed_inherited_validation_does_not_publish_partial_values_or_consume_redo() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut setup) = seed();
    setup.set_cell_input(&mut book, 0, "B2", "=[@Qty]*2").unwrap();
    book.sheet_mut(0).unwrap().set_data_validation(range("B3", "B4"), Some(DataValidationRule {
        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 0., max: 5. },
        ignore_blank: false, operator: Default::default(),
    })).unwrap();
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    book.sheet_mut(1).unwrap().subscribe_cell("A1", move || observed.set(observed.get() + 1));
    calls.set(0);
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "F1", "77").unwrap();
    history.undo(&mut book).unwrap();
    let original = book.snapshot_tables();
    let clip = ClipboardSnapshot::from_tsv("3\n4", ClipboardPasteMode::All).unwrap();
    let result = book.paste_clipboard_with_history(&clip, 0,
        &ClipboardPasteOptions::new(range("A3", "A3")), &mut history);
    assert_eq!(result, Err("DATA_VALIDATION_FAILED"));
    assert_eq!(calls.get(), 0);
    assert_eq!(book.snapshot_tables(), original);
    for addr in ["A3", "A4", "B3", "B4"] { assert_eq!(book.get_cell("Sheet1", addr), Value::Null); }
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
}

#[test]
fn column_data_paste_generates_missing_headers_and_keeps_totals_row() {
    let (mut book, mut history) = seed();
    book.set_table_totals_row("Orders", true).unwrap();
    let original = book.snapshot_tables();
    paste(&mut book, &mut history, "C2", "7\t8");
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "D3"));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("Column1".into()));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Text("Column2".into()));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(4.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(7.));
}

#[test]
fn skip_blanks_inherits_missing_formulas_but_keeps_existing_exceptions() {
    let (mut book, mut setup) = seed();
    setup.set_cell_input(&mut book, 0, "B2", "=[@Qty]*2").unwrap();
    book.set_cell(0, "B4", Value::Number(99.));
    let mut history = WorkbookHistory::default();
    let clip = ClipboardSnapshot::from_tsv("3\t\n4\t", ClipboardPasteMode::All).unwrap();
    let options = ClipboardPasteOptions { skip_blanks: true,
        ..ClipboardPasteOptions::new(range("A3", "A3")) };
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(6.));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(99.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(99.));
}

#[test]
fn unrelated_tables_survive_history_and_changed_expanded_table_rejects_undo() {
    let (mut book, mut history) = seed();
    paste(&mut book, &mut history, "A3", "3\t6");
    book.define_table(Some("Other"), 0, range("F1", "G2"), true).unwrap();
    let other = book.get_table("Other").unwrap().clone();
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Other"), Some(&other));
    history.redo(&mut book).unwrap();
    book.rename_table("Orders", "RenamedOrders").unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.));
    assert_eq!(book.get_table("Other"), Some(&other));
}

#[test]
fn first_pasted_record_in_an_empty_table_inherits_and_undo_restores_input_position() {
    use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
    use einfach_excel_core::TableColumnFormula;
    for rows in [1, 2] {
        let mut book = Workbook::new();
        book.restore_tables(TableRegistrySnapshot::from_entries(vec![
            TableEntry::from_parts("Orders", "Sheet1", range("A1", "B1"), false, false,
                vec!["Qty".into(), "Amount".into()]).with_insert_row(true)
                .with_calculated_columns(vec![None, Some(TableColumnFormula::new(0, "=A1*2").unwrap())]),
        ])).unwrap();
        let original = book.snapshot_tables();
        let mut history = WorkbookHistory::default();
        paste(&mut book, &mut history, "A1", if rows == 1 { "3" } else { "3\n4" });
        assert!(!book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(6.));
        if rows == 2 { assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(8.)); }
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(6.));
    }
}

#[test]
fn skipped_spill_children_outside_the_table_survive_expansion_history() {
    let (mut book, mut history) = seed();
    // 数组锚点在粘贴区域外，D3:D4 只是被 skip_blanks 跳过的派生格。
    book.set_formula(0, "D2", "=SEQUENCE(3)");
    assert_eq!(book.get_cell("Sheet1", "D4"), Value::Number(3.));
    let clip = ClipboardSnapshot::from_tsv("3\t6\t\t\n4\t8\t\t", ClipboardPasteMode::All).unwrap();
    let options = ClipboardPasteOptions { skip_blanks: true,
        ..ClipboardPasteOptions::new(range("A3", "A3")) };
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B4"));
    for _ in 0..2 {
        assert_eq!(book.get_cell("Sheet1", "D3"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "D4"), Value::Number(3.));
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "D3"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "D4"), Value::Number(3.));
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.sheet(0).unwrap().formula_text_at(CellAddress::parse("D2").unwrap()).as_deref(),
            Some("=SEQUENCE(3)"));
        history.redo(&mut book).unwrap();
    }
}
