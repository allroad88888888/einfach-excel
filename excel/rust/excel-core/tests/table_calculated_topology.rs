//! 计算列模板随工作表拓扑变化；后续新行不能复活已删除的引用或引用旧名字。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, TableRegistrySnapshot, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.));
    book.add_sheet("Report");
    book.set_cell(1, "A1", Value::Text("Amount".into()));
    book.set_cell(1, "B1", Value::Text("Total".into()));
    book.set_cell(1, "A2", Value::Number(10.));
    book.set_cell(1, "A3", Value::Number(20.));
    book.define_table(Some("Orders"), 1, range("A1", "B3"), true).unwrap();
    (book, WorkbookHistory::default())
}
fn source(book: &Workbook) -> String {
    book.get_table("Orders").unwrap().calculated_columns()[1]
        .as_ref().unwrap().formula().into()
}

#[test]
fn rename_source_sheet_preserves_exact_templates_and_new_row_inheritance() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B3", "=Sheet1!$A$1*[@Amount]").unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    history.edit_sheet(&mut book, Some(0), "Rates 2026").unwrap();
    assert_eq!(history.undo_count(), 1);
    assert!(source(&book).contains("'Rates 2026'!$A$1"));
    let after = book.snapshot_tables();
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), after);
    }
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(60.));
}

#[test]
fn undo_rename_does_not_rewrite_preexisting_dangling_new_name() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!$A$1+Future!$A$1+[@Amount]").unwrap();
    let before = book.snapshot_tables();
    history.edit_sheet(&mut book, Some(0), "Future").unwrap();
    assert_eq!(book.get_cell("Report", "B2"), Value::Number(14.));
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert!(source(&book).contains("Future!$A$1"));
        assert!(source(&book).contains("Sheet1!$A$1"));
        assert!(matches!(book.get_cell("Report", "B2"), Value::Error(_)));
        history.redo(&mut book).unwrap();
    }
}

#[test]
fn rename_template_owner_keeps_stable_identity_and_explicit_self_reference() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Report!A2+Sheet1!$A$1").unwrap();
    let before = book.snapshot_tables();
    let key = book.sheet_key(1);
    history.edit_sheet(&mut book, Some(1), "Sales View").unwrap();
    assert_eq!(book.sheet_key(1), key);
    assert!(source(&book).contains("'Sales View'!A2"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Sales View", "B4"), Value::Number(32.));
}

#[test]
fn deleting_source_rewrites_templates_across_index_shift_and_undo_restores_them() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!$A$1*[@Amount]").unwrap();
    let before = book.snapshot_tables();
    let report_key = book.sheet_key(1);
    history.clear("");
    history.remove_sheet(&mut book, 0).unwrap();
    assert_eq!(book.sheet_key(0), report_key);
    assert!(source(&book).contains("#REF!"));
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Report", "B3"), Value::Number(40.));
        history.redo(&mut book).unwrap();
    }
    history.set_cell_input(&mut book, 0, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Error(ValueError::InvalidRef));
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(60.));
}

#[test]
fn deleting_template_owner_keeps_its_definition_in_the_existing_sheet_archive() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Report!A2*2").unwrap();
    let before = book.snapshot_tables();
    history.remove_sheet(&mut book, 1).unwrap();
    assert!(book.get_table("Orders").is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(60.));
}

#[test]
fn undo_add_preserves_missing_sheet_template_instead_of_baking_ref_error() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Future!$A$1+[@Amount]").unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    let index = history.edit_sheet(&mut book, None, "Future").unwrap();
    book.set_cell(index, "A1", Value::Number(5.));
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert!(source(&book).contains("Future!$A$1"));
        history.redo(&mut book).unwrap();
    }
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(35.));
}

#[test]
fn out_of_history_template_edit_rejects_rename_undo_before_any_topology_change() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!$A$1*[@Amount]").unwrap();
    history.edit_sheet(&mut book, Some(0), "Rates").unwrap();
    let valid = book.snapshot_tables();
    let changed = book.get_table("Orders").unwrap().clone().with_calculated_columns(vec![
        None, Some(TableColumnFormula::new(1, "=99").unwrap()),
    ]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![changed])).unwrap();
    let external = book.snapshot_tables();
    let count = history.undo_count();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.name(0), Some("Rates"));
    assert_eq!(book.snapshot_tables(), external);
    assert_eq!(history.undo_count(), count);
    book.restore_tables(valid).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.name(0), Some("Sheet1"));
}

#[test]
fn direct_topology_operations_and_archive_restore_follow_template_sources_too() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!$A$1*[@Amount]").unwrap();
    assert!(book.rename_sheet(0, "Rates"));
    assert!(source(&book).contains("Rates!$A$1"));
    let before = book.snapshot_tables();
    let archive = book.archive_sheet(0).unwrap();
    assert!(source(&book).contains("#REF!"));
    archive.restore(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert!(book.move_sheet(1, 0));
    history.clear("");
    history.set_cell_input(&mut book, 0, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(60.));
}

#[test]
fn archive_restore_rejects_external_template_edits_before_reinserting_the_sheet() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!$A$1*[@Amount]").unwrap();
    let archive = book.archive_sheet(0).unwrap();
    let valid = book.snapshot_tables();
    let changed = book.get_table("Orders").unwrap().clone().with_calculated_columns(vec![
        None, Some(TableColumnFormula::new(1, "=99").unwrap()),
    ]);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![changed])).unwrap();
    let external = book.snapshot_tables();
    let archive = archive.restore(&mut book).unwrap_err();
    assert_eq!(book.sheet_count(), 1);
    assert_eq!(book.name(0), Some("Report"));
    assert_eq!(book.snapshot_tables(), external);
    book.restore_tables(valid).unwrap();
    archive.restore(&mut book).unwrap();
    history.clear("");
    history.set_cell_input(&mut book, 1, "A4", "30").unwrap();
    assert_eq!(book.get_cell("Report", "B4"), Value::Number(60.));
}
