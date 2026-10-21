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
    use einfach_excel_core::clipboard::ClipboardArithmetic;
    let (mut book, mut history) = seed();
    book.set_formula(0, "C3", "=IFERROR(ROWS(Orders[Amount]),0)");
    book.sheet_mut(0).unwrap().set_data_validation(range("C3", "C3"), Some(DataValidationRule {
        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 1., max: 1. },
        ignore_blank: false, operator: Default::default(),
    })).unwrap();
    // 值运算才校验公式结果；普通公式粘贴本来就不执行数据验证。
    let clip = ClipboardSnapshot::from_tsv("7\t14\t0", ClipboardPasteMode::All).unwrap();
    let options = ClipboardPasteOptions { mode: ClipboardPasteMode::Values,
        arithmetic: ClipboardArithmetic::Add, ..ClipboardPasteOptions::new(range("A3", "C3")) };
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(1.));
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(0.));
    book.sheet_mut(0).unwrap().set_data_validation(range("C3", "C3"), Some(DataValidationRule {
        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 2., max: 2. },
        ignore_blank: false, operator: Default::default(),
    })).unwrap();
    let before = book.snapshot_tables();
    assert_eq!(book.paste_clipboard_with_history(&clip, 0, &options, &mut history),
        Err("DATA_VALIDATION_FAILED"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(0.));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
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

#[test]
fn rejected_direct_formula_input_restores_the_empty_table() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    let (mut book, _) = seed();
    book.sheet_mut(0).unwrap().set_data_validation(range("A3", "A3"), Some(DataValidationRule {
        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 2., max: 2. },
        ignore_blank: false, operator: Default::default(),
    })).unwrap();
    let before = book.snapshot_tables();
    assert_eq!(book.set_cell_input(0, "A3", "=ROWS(Orders[Amount])"), Err("DATA_VALIDATION_FAILED"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn array_paste_rolls_back_with_or_without_caller_history() {
    for recorded in [false, true] {
        for blocked in [false, true] {
            let (mut book, mut history) = seed();
            if blocked { book.set_cell(0, "A4", Value::Number(99.)); }
            let before = book.snapshot_tables();
            let clip = ClipboardSnapshot::from_tsv("=SEQUENCE(2)", ClipboardPasteMode::All).unwrap();
            let options = ClipboardPasteOptions::new(range("A3", "A3"));
            let result = if recorded {
                book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
            } else { book.paste_clipboard(&clip, 0, &options) };
            assert_eq!(result, Err("Spilled arrays cannot be entered inside a table."));
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
            assert_eq!(book.get_cell("Sheet1", "A4"), if blocked { Value::Number(99.) } else { Value::Null });
            assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
            assert_eq!(history.undo_count(), 0);
        }
    }
}

#[test]
fn paste_subscribers_never_see_a_rejected_record_and_undo_keeps_other_tables() {
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut history) = seed();
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    book.sheet_mut(1).unwrap().subscribe_cell("A1", move || observed.set(observed.get() + 1));
    calls.set(0);
    let options = ClipboardPasteOptions::new(range("A3", "A3"));
    let array = ClipboardSnapshot::from_tsv("=SEQUENCE(2)", ClipboardPasteMode::All).unwrap();
    assert!(book.paste_clipboard_with_history(&array, 0, &options, &mut history).is_err());
    assert_eq!(calls.replace(0), 0);
    let value = ClipboardSnapshot::from_tsv("7", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&value, 0, &options, &mut history).unwrap();
    assert_eq!(calls.replace(0), 1);
    book.define_table(Some("Other"), 0, range("F1", "F2"), true).unwrap();
    let other = book.get_table("Other").unwrap().clone();
    calls.set(0);
    history.undo(&mut book).unwrap();
    assert_eq!(calls.replace(0), 1);
    assert_eq!(book.get_table("Other"), Some(&other));
    history.redo(&mut book).unwrap();
    assert_eq!(calls.get(), 1);
    assert_eq!(book.get_table("Other"), Some(&other));
}

#[test]
fn text_columns_uses_the_same_empty_table_history() {
    use einfach_excel_core::text_columns::TextColumnsMode;
    use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
    let (mut book, mut history) = seed();
    book.set_cell(0, "F1", Value::Text("7,14".into()));
    let before = book.snapshot_tables();
    let request = TextColumnsRequest {
        sheet: 0, column_types: vec![], number_options: None, row_count: 100, col_count: 10,
        source: range("F1", "F1"), destination: CellAddress::parse("A3").unwrap(),
        mode: TextColumnsMode::Delimited {
            delimiters: vec![','], merge_consecutive: false, qualifier: None,
        },
    };
    history.split_text_columns(&mut book, &request, false).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("14".into()));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("14".into()));
    assert_eq!(book.get_cell("Sheet1", "F1"), Value::Text("7,14".into()));
}
