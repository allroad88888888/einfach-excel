//! 表头腾位只移动完整合并矩形，历史保留原始内容与几何。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}

fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("B3", "C4"), false, false, vec!["Qty".into(), "Tax".into()],
    )])).unwrap();
    book.set_cell(0, "B2", Value::Text("Occupied".into()));
    book.set_cell(0, "B3", Value::Number(2.));
    book.set_cell(0, "B4", Value::Number(3.));
    (book, WorkbookHistory::default())
}

#[test]
fn whole_merges_move_with_values_formulas_and_styles_in_one_history_entry() {
    use einfach_excel_core::{CellStyle, StyleScope};
    let (mut book, mut history) = seed();
    book.set_formula(0, "B6", "=B3+B4");
    book.merge_cells(0, range("B6", "C7"), MergeAction::Merge, false).unwrap();
    book.merge_cells(0, range("E6", "F7"), MergeAction::Merge, false).unwrap();
    book.sheet_mut(0).unwrap().patch_format_range(range("B6", "C7"), StyleScope::Cell,
        CellStyle { bold: Some(true), ..Default::default() });
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=Sheet1!B6");
    let formats = book.sheet(0).unwrap().snapshot_format_range(range("B1", "C10"));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(history.undo_count(), 1);
        assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("E6", "F7"), range("B7", "C8")]);
        assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(5.));
        assert_eq!(book.sheet(0).unwrap().get_formula("B7").as_deref(), Some("=(B4+B5)"));
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(5.));
        assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!B7"));
        assert!(book.sheet(0).unwrap().get_format("C8").bold);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("B6", "C7"), range("E6", "F7")]);
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Number(5.));
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("B1", "C10")), formats);
        history.redo(&mut book).unwrap();
    }
    book.set_cell(0, "B4", Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(10.));
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(10.));
}

#[test]
fn empty_merge_above_headers_uses_local_insertion_and_keeps_the_merge_untouched() {
    let (mut book, mut history) = seed();
    book.clear_cell(0, "B2");
    book.merge_cells(0, range("A2", "D2"), MergeAction::Merge, false).unwrap();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("B3", "C5"));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Qty".into()));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(2.));
    assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("A2", "D2")]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("B3", "C4"));
    assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("A2", "D2")]);
}

#[test]
fn split_or_overflow_merges_reject_before_any_mutation_and_keep_redo() {
    for merged in [range("A6", "B7"), range("C6", "D7"), range("B99", "C100")] {
        let (mut book, mut history) = seed();
        book.merge_cells(0, merged, MergeAction::Merge, false).unwrap();
        history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
        history.undo(&mut book).unwrap();
        let tables = book.snapshot_tables();
        assert!(history.set_table_headers(&mut book, "Orders", true, 100).is_err());
        assert_eq!(book.snapshot_tables(), tables);
        assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[merged]);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(2.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
    }
}

#[test]
fn out_of_history_merge_changes_reject_undo_but_adjacent_changes_survive() {
    let (mut book, mut history) = seed();
    book.merge_cells(0, range("B6", "C7"), MergeAction::Merge, false).unwrap();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    book.merge_cells(0, range("E6", "F7"), MergeAction::Merge, false).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("B6", "C7"), range("E6", "F7")]);
    history.redo(&mut book).unwrap();
    book.merge_cells(0, range("B7", "C8"), MergeAction::Unmerge, false).unwrap();
    let tables = book.snapshot_tables();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.sheet(0).unwrap().merged_ranges(), &[range("E6", "F7")]);
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn moving_an_empty_merge_unblocks_an_adjacent_array_and_undo_blocks_it_again() {
    let (mut book, mut history) = seed();
    book.merge_cells(0, range("B6", "C7"), MergeAction::Merge, false).unwrap();
    book.set_formula(0, "A6", "=SEQUENCE(1,4)");
    assert!(matches!(book.get_cell("Sheet1", "A6"), Value::Error(_)));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C6"), Value::Number(3.));
    history.undo(&mut book).unwrap();
    assert!(matches!(book.get_cell("Sheet1", "A6"), Value::Error(_)));
    assert_eq!(book.get_cell("Sheet1", "C6"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C6"), Value::Number(3.));
}
