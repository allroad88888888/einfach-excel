//! Batch operations reject before the first write, including neighbors and other sheets.
use super::*;
use einfach_excel_core::{AutoFillDirection, AutoFillRequest, AutoFillSeries, FindLookIn,
    FindQuery, SortDirection, SortKey, BorderSpec, BorderStyle, sheet::BorderPreset};

#[test]
fn raw_and_inferred_fill_reject_a_locked_tail_without_changing_an_editable_prefix() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0));
    allow(&mut book, range(1, 0, 1, 0));
    protect(&mut book);
    let request = AutoFillRequest { sheet_idx: 0, source_range: range(0, 0, 0, 0),
        target_range: range(0, 0, 2, 0), direction: AutoFillDirection::Down,
        series: AutoFillSeries::Copy, step: None, text_pattern: None, list: None };
    assert!(book.apply_auto_fill(&request).is_err());
    assert!(book.apply_inferred_auto_fill(&request).is_err());
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    unprotect(&mut book);
    allow(&mut book, range(2, 0, 2, 0));
    protect(&mut book);
    assert_eq!(book.apply_auto_fill(&request).unwrap().written, 2);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(1.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(1.0));
}

#[test]
fn cut_rewrites_a_locked_formula_on_another_sheet_and_replays_only_its_source() {
    // 回归（#16）：剪切把被动的跨表引用改写当作编辑受保护单元格，整次剪切被拒绝。
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    book.add_sheet("Other");
    book.set_formula(1, "A1", "=Sheet1!A1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&cut, 0,
        &ClipboardPasteOptions::new(range(1, 1, 1, 1)), &mut history).unwrap();
    let other = |book: &Workbook| book.sheet(1).unwrap().get_formula("A1");
    assert_eq!(other(&book).as_deref(), Some("=Sheet1!B2"));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(7.0));
    // 不在该历史里的格式修改，撤销/重做只还原引用方的源码，不覆盖它。
    book.sheet_mut(1).unwrap().set_format("A1", einfach_excel_core::CellFormat { bold: true, ..Default::default() });
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(other(&book).as_deref(), Some("=Sheet1!A1"));
    assert!(book.sheet(1).unwrap().get_format("A1").bold);
    history.redo(&mut book).unwrap();
    assert_eq!(other(&book).as_deref(), Some("=Sheet1!B2"));
    // 剪切源或粘贴目标锁定时仍整体拒绝，引用方不变。
    let cut = book.capture_clipboard(0, range(1, 1, 1, 1), true).unwrap();
    protect(&mut book);
    assert!(book.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range(2, 2, 2, 2))).is_err());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(7.0));
    assert_eq!(other(&book).as_deref(), Some("=Sheet1!B2"));
}

#[test]
fn cut_judges_reference_cycles_against_the_final_writes() {
    // 回归：排队时按旧依赖图判环，覆盖前的 B1 让引用方被误判为环并写成 #CYCLE，锁定格的原公式随之丢失。
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    book.add_sheet("Other");
    book.set_formula(1, "A1", "=Sheet1!A1");
    book.set_formula(0, "B1", "=Other!A1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&cut, 0,
        &ClipboardPasteOptions::new(range(0, 1, 0, 1)), &mut history).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!B1"));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(7.0));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1"));
    assert_eq!(book.sheet(0).unwrap().get_formula("B1").as_deref(), Some("=Other!A1"));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(7.0));
}

#[test]
fn undoing_a_cut_publishes_the_reference_only_once_it_is_restored() {
    // 回归：撤销先恢复源/目标、再恢复引用源码，订阅者看到引用方指向已清空目标时的中间值。
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    book.add_sheet("Other");
    book.set_formula(1, "A1", "=Sheet1!A1+1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&cut, 0,
        &ClipboardPasteOptions::new(range(0, 1, 0, 1)), &mut history).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(8.0));
    let fires = std::rc::Rc::new(std::cell::Cell::new(0));
    let seen = fires.clone();
    let _sub = book.sheet_mut(1).unwrap().subscribe_cell("A1", move || seen.set(seen.get() + 1));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(8.0));
    assert_eq!(fires.get(), 0, "the reference's value never left 8");
}

#[test]
fn a_cyclic_source_moves_as_its_error_value_and_the_locked_reference_follows() {
    // 非迭代模式下成环格只存错误值，剪切把它当字面量移动，改写后的引用不成环，照常跟随。
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_formula(1, "A1", "=Sheet1!A1");
    book.set_formula(0, "A1", "=Other!A1+1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    book.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range(0, 1, 0, 1))).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!B1"));
}

#[test]
fn an_iterative_cycle_through_a_locked_reference_refuses_the_cut() {
    // 迭代计算下环以真公式存在：引用方改写在最终写入里成环时不算被动，锁定格仍拒绝整次剪切。
    let mut book = Workbook::new();
    book.add_sheet("Other");
    assert!(book.set_iterative_calculation(einfach_excel_core::IterativeConfig {
        enabled: true, max_iterations: 10, max_change: 0.001,
    }));
    book.set_formula(1, "A1", "=Sheet1!A1");
    book.set_formula(0, "A1", "=Other!A1+1");
    assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=Other!A1+1"));
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    assert!(book.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range(0, 1, 0, 1))).is_err());
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1"));
    assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=Other!A1+1"));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
}

#[test]
fn cross_sheet_cut_rewrites_a_locked_formula_on_a_third_sheet() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    book.add_sheet("Other");
    book.add_sheet("Third");
    book.set_formula(1, "A1", "=Sheet1!A1");
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&cut, 2,
        &ClipboardPasteOptions::new(range(1, 1, 1, 1)), &mut history).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Third!B2"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1"));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
}

#[test]
fn paste_mixed_locked_targets_rejects_before_an_editable_prefix_and_keeps_history() {
    let mut book = Workbook::new();
    let text = ClipboardSnapshot::from_tsv("8\t9", ClipboardPasteMode::All).unwrap();
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    assert!(book.paste_clipboard_with_history(&text, 0,
        &ClipboardPasteOptions::new(range(1, 1, 1, 1)), &mut history).is_err());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn shared_border_cannot_write_a_locked_neighbor() {
    let mut book = Workbook::new();
    let pen = BorderSpec { style: BorderStyle::Thick, color: Some("#c00000".into()) };
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let before = book.sheet(0).unwrap().get_format("C2");
    let mut history = WorkbookHistory::default();
    assert!(history.patch_range_borders(&mut book, 0, range(1, 1, 1, 1),
        BorderPreset::Right, pen).is_err());
    assert_eq!(book.sheet(0).unwrap().get_format("C2"), before);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn sort_and_auto_fit_enforce_native_permissions() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(1.0));
    protect(&mut book);
    let keys = [SortKey { col: 0, direction: SortDirection::Ascending,
        case_sensitive: false, empty_first: false }];
    assert!(book.sort_range(0, range(0, 0, 1, 0), &keys, &[]).is_err());
    assert!(book.auto_fit_dimensions(0, range(0, 0, 1, 0), "column", 28, 120,
        |_, _, _| Ok(200.0)).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(book.sheet(0).unwrap().col_width(0), None);
}

#[test]
fn replace_and_multiarea_clear_do_not_partially_write_an_editable_prefix() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("old".into()));
    book.set_cell(0, "B1", Value::Text("old".into()));
    allow(&mut book, range(0, 0, 0, 0));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    let query = FindQuery { needle: "old".into(), case_sensitive: false, whole_cell: true,
        wildcards: false, look_in: FindLookIn::Formulas };
    assert!(history.replace_by_query(&mut book, &[(0, range(0, 0, 0, 1))],
        &query, "new", None).is_err());
    assert!(history.clear_selection(&mut book, 0, &[(range(0, 0, 0, 0), StyleScope::Cell),
        (range(0, 1, 0, 1), StyleScope::Cell)], ClearSelectionMode::All).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("old".into()));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("old".into()));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn text_columns_and_remove_duplicates_reject_mixed_editable_output_before_writing() {
    use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
    use einfach_excel_core::text_columns::TextColumnsMode;
    use einfach_excel_core::workbook_remove_duplicates::{DuplicateComparison, RemoveDuplicatesRequest};
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("left,right".into()));
    book.set_cell(0, "B2", Value::Number(7.0));
    book.set_cell(0, "B3", Value::Number(7.0));
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    let split = TextColumnsRequest { sheet: 0, source: range(0, 0, 0, 0),
        destination: CellAddress::new(1, 1), column_types: vec![], number_options: None,
        row_count: 100, col_count: 8, mode: TextColumnsMode::Delimited {
            delimiters: vec![','], merge_consecutive: false, qualifier: Some('"'),
        } };
    assert!(history.split_text_columns(&mut book, &split, true).is_err());
    let duplicates = RemoveDuplicatesRequest { sheet: 0, range: range(1, 1, 2, 1),
        columns: vec![1], has_header: false, comparison: DuplicateComparison::Exact,
        row_count: 100, col_count: 8 };
    assert!(history.remove_duplicates(&mut book, &duplicates).is_err());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn raw_input_cannot_activate_empty_table_metadata_inside_an_editable_range() {
    use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range(2, 0, 2, 1), false, false,
        vec!["Qty".into(), "Amount".into()]).with_insert_row(true)])).unwrap();
    allow(&mut book, range(2, 0, 2, 1));
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    assert!(history.set_cell_input(&mut book, 0, "A3", "7").is_err());
    book.set_cell(0, "A3", Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert!(book.get_table("Orders").unwrap().has_insert_row());
    assert!(book.try_set_cell(0, "A3", Value::Number(7.0)).is_err());
    unprotect(&mut book);
    book.add_sheet("Other");
    let text = ClipboardSnapshot::from_tsv("7", ClipboardPasteMode::All).unwrap();
    book.paste_clipboard_with_history(&text, 0,
        &ClipboardPasteOptions::new(range(2, 0, 2, 0)), &mut history).unwrap();
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    // Only the Table's own sheet locks its insert-row state; a protected neighbour does not.
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    protect(&mut book);
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.0));
    assert!(!book.get_table("Orders").unwrap().has_insert_row());
    unprotect(&mut book);
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Orders").unwrap().has_insert_row());
}
