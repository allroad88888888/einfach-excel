//! 批量内容写入的待输入行状态必须参与同一条格子历史。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1", range("A3", "B3"), false, false,
            vec!["Qty".into(), "Amount".into()]).with_insert_row(true),
    ])).unwrap();
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=ROWS(Orders[Qty])");
    book.set_formula(1, "A2", "=Orders[Amount]");
    (book, WorkbookHistory::default())
}

#[test]
fn paste_is_one_record_and_undo_restores_the_empty_table_and_cross_sheet_consumers() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    let clip = ClipboardSnapshot::from_tsv("7\t14", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&clip, 0, &ClipboardPasteOptions::new(range("A3", "B3")),
        &mut history).unwrap();
    for _ in 0..2 {
        assert!(!book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(1.));
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(14.));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
        history.redo(&mut book).unwrap();
    }
}

#[test]
fn formula_paste_sees_the_new_record_before_input_validation() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    let (mut book, mut history) = seed();
    book.sheet_mut(0).unwrap().set_data_validation(range("A3", "A3"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 1., max: 1. },
        ignore_blank: false, operator: Default::default(),
    })).unwrap();
    let clip = ClipboardSnapshot::from_tsv("=ROWS(Orders[Amount])", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&clip, 0, &ClipboardPasteOptions::new(range("A3", "A3")),
        &mut history).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(1.));
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
}

#[test]
fn primitive_and_loader_writes_create_records_but_clear_and_format_do_not() {
    for write in 0..4 {
        let (mut book, mut history) = seed();
        let before = book.snapshot_tables();
        history.begin(&book, 0, range("A3", "B3"), "Bulk write", true).unwrap();
        match write {
            0 => book.set_cell(0, "A3", Value::Number(7.)),
            1 => { book.try_set_cell(0, "A3", Value::Text("".into())).unwrap(); }
            2 => { book.set_formula(0, "A3", "=\"\""); }
            _ => book.bulk_load(|loader| loader.set_cell(0, "B3", Value::Number(14.))),
        }
        history.finish(&mut book, true).unwrap();
        assert!(!book.get_table("Orders").unwrap().has_insert_row());
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.begin(&book, 0, range("A3", "B3"), "Clear", true).unwrap();
        book.clear_range(0, range("A3", "B3"));
        history.finish(&mut book, true).unwrap();
        assert_eq!(history.redo_count(), 1);
        history.begin(&book, 0, range("A3", "B3"), "Format", false).unwrap();
        book.sheet_mut(0).unwrap().patch_format_range(range("A3", "B3"), StyleScope::Cell,
            CellStyle { bold: Some(true), ..Default::default() });
        history.finish(&mut book, true).unwrap();
        assert!(book.get_table("Orders").unwrap().has_insert_row());
    }
}

#[test]
fn failed_batch_and_final_empty_loader_writes_leave_no_record_or_history() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    history.begin(&book, 0, range("A3", "B3"), "Rejected write", true).unwrap();
    book.bulk_load(|loader| loader.set_cell(0, "A3", Value::Number(7.)));
    history.finish(&mut book, false).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    history.begin(&book, 0, range("A3", "B3"), "Final empty", true).unwrap();
    book.bulk_load(|loader| {
        loader.set_cell(0, "A3", Value::Number(7.));
        loader.clear_cell(0, "A3");
    });
    history.finish(&mut book, true).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn external_table_changes_reject_undo_before_touching_cells() {
    let (mut book, mut history) = seed();
    history.begin(&book, 0, range("A3", "A3"), "Write", true).unwrap();
    book.set_cell(0, "A3", Value::Number(7.));
    history.finish(&mut book, true).unwrap();
    book.rename_table("Orders", "RenamedOrders").unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.));
    assert_eq!(history.undo_count(), 1);
}
