//! 计算列模板是后续输入的源码，引用改写必须与当前单元格共用原生历史。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::NamedRangeAction;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (addr, text) in [("A1", "Amount"), ("B1", "Total"), ("D1", "Amount"), ("E1", "Total")] {
        book.set_cell(0, addr, Value::Text(text.into()));
    }
    for (addr, value) in [("A2", 10.), ("A3", 20.), ("D2", 3.), ("D3", 4.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B3"), true).unwrap();
    book.define_table(Some("OtherTable"), 0, range("D1", "E3"), true).unwrap();
    (book, WorkbookHistory::default())
}
fn source(book: &Workbook, name: &str) -> String {
    book.get_table(name).unwrap().calculated_columns().last().unwrap()
        .as_ref().unwrap().formula().into()
}

#[test]
fn table_rename_updates_own_and_other_templates_and_replays_as_one_entry() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B3", "=Orders[@Amount]*2").unwrap();
    history.set_cell_input(&mut book, 0, "E2", "=SUM(Orders[Amount])").unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    history.rename_table(&mut book, "Orders", "Sales").unwrap();
    assert_eq!(history.undo_count(), 1);
    let after = book.snapshot_tables();
    assert!(source(&book, "Sales").contains("Sales"));
    assert!(source(&book, "OtherTable").contains("Sales"));
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), after);
    }
    history.set_cell_input(&mut book, 0, "A4", "40").unwrap();
    history.set_cell_input(&mut book, 0, "D4", "5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(80.));
    assert_eq!(book.get_cell("Sheet1", "E4"), Value::Number(70.));
    // 同步后的模板仍能识别无例外整列，不能退化成只改当前格。
    history.set_cell_input(&mut book, 0, "B2", "=Sales[@Amount]*3").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(120.));
}

#[test]
fn implicit_column_references_keep_their_own_table_context() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B3", "=[@Amount]*2").unwrap();
    history.set_cell_input(&mut book, 0, "E2", "=[@Amount]*3").unwrap();
    let before = book.snapshot_tables();
    let other = source(&book, "OtherTable");
    history.rename_table_column(&mut book, "Orders", "Amount", "Net").unwrap();
    assert!(source(&book, "Orders").contains("Net"));
    assert_eq!(source(&book, "OtherTable"), other);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A4", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(80.));
}

#[test]
fn resize_removed_column_rewrites_templates_and_preserves_absolute_column_alignment() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*2").unwrap();
    history.set_cell_input(&mut book, 0, "E2", "=SUM(Orders[Amount])").unwrap();
    let before = book.snapshot_tables();
    history.resize_table(&mut book, "Orders", range("B1", "B3")).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().calculated_columns().len(), 1);
    assert!(source(&book, "Orders").contains("#REF!"));
    assert!(source(&book, "OtherTable").contains("#REF!"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "D4", "5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "E4"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn converting_table_rewrites_other_templates_but_undo_restores_own_definition() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*2").unwrap();
    history.set_cell_input(&mut book, 0, "E2", "=SUM(Orders[Amount])").unwrap();
    let before = book.snapshot_tables();
    history.convert_table_to_range(&mut book, "Orders").unwrap();
    assert!(!source(&book, "OtherTable").contains("Orders"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "D4", "5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "E4"), Value::Number(30.));
    book.set_cell(0, "A2", Value::Number(100.));
    assert_eq!(book.get_cell("Sheet1", "E4"), Value::Number(120.));
}

#[test]
fn converting_this_row_reference_keeps_the_templates_original_row() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "E3", "=Orders[@Amount]*2").unwrap();
    history.convert_table_to_range(&mut book, "Orders").unwrap();
    book.set_cell(0, "A4", Value::Number(40.));
    history.set_cell_input(&mut book, 0, "D4", "5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "E4"), Value::Number(80.));
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    assert!(source(&book, "OtherTable").contains("Orders[@Amount]"));
}

#[test]
fn shrink_past_origin_keeps_column_context_and_conversion_row_distinct() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "E3", "=Orders[@Amount]+[@Amount]").unwrap();
    history.resize_table(&mut book, "OtherTable", range("D1", "E2")).unwrap();
    history.rename_table_column(&mut book, "OtherTable", "Amount", "Net").unwrap();
    assert!(source(&book, "OtherTable").contains("[@Net]"));
    history.convert_table_to_range(&mut book, "Orders").unwrap();
    // 缩表不删除外部旧格；再次扩表时只给空白结果格继承公式。
    book.clear_range(0, range("E3", "E3"));
    history.set_cell_input(&mut book, 0, "D3", "7").unwrap();
    assert_eq!(book.get_cell("Sheet1", "E3"), Value::Number(27.));
}

#[test]
fn header_only_table_still_renames_template_before_data_is_added_again() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B3", "=[@Amount]*2").unwrap();
    history.resize_table(&mut book, "Orders", range("A1", "B1")).unwrap();
    book.clear_range(0, range("A2", "B3"));
    let before = book.snapshot_tables();
    history.rename_table_column(&mut book, "Orders", "Amount", "Net").unwrap();
    assert!(source(&book, "Orders").contains("[@Net]"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A2", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(80.));
}

#[test]
fn named_range_rename_updates_template_even_when_every_cell_is_an_exception() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "G1", Value::Number(2.));
    book.define_named_range("Multiplier", 0, range("G1", "G1")).unwrap();
    history.set_cell_input(&mut book, 0, "B2", "=[@Amount]*Multiplier").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "99").unwrap();
    history.set_cell_input(&mut book, 0, "B3", "88").unwrap();
    let before = book.snapshot_tables();
    history.change_named_range(&mut book, 0, NamedRangeAction::Update {
        name: "Multiplier".into(), new_name: "Factor".into(), target: None,
    }).unwrap();
    assert!(source(&book, "Orders").contains("Factor"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    history.redo(&mut book).unwrap();
    history.set_cell_input(&mut book, 0, "A4", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(80.));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(99.));
}
