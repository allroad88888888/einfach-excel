//! 为表头腾位只移动该列带；公式跟随、稀疏样式与原生历史必须一起完成。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook, TableColumnFormula};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}

fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.));
    book.set_cell(0, "A2", Value::Number(3.));
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1", range("A1", "B2"), false, false,
            vec!["Qty".into(), "Total".into()]).with_calculated_columns(vec![None,
                Some(TableColumnFormula::new(0, "=A1*2").unwrap())]),
    ])).unwrap();
    book.set_formula(0, "B1", "=A1*2");
    book.set_formula(0, "B2", "=A2*2");
    book.set_cell(0, "A5", Value::Text("Below".into()));
    book.set_cell(0, "D2", Value::Number(99.));
    book.set_formula(0, "D1", "=$A$1+$B$2");
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=Orders[Total]");
    book.set_formula(1, "C1", "=SUM(Sheet1!A1:A2)");
    (book, WorkbookHistory::default())
}

#[test]
fn first_row_gets_headers_without_moving_adjacent_cells_and_undo_is_exact() {
    let (mut book, mut history) = seed();
    let before = book.snapshot_tables();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(history.undo_count(), 1);
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B3"));
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("Qty".into()));
        assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(6.));
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "A6"), Value::Text("Below".into()));
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(8.));
        assert_eq!(book.get_cell("Sheet1", "D2"), Value::Number(99.));
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(6.));
        assert_eq!(book.get_cell("Report", "C1"), Value::Number(5.));
        let template = book.get_table("Orders").unwrap().calculated_columns()[1].as_ref().unwrap();
        assert_eq!(template.row(), 1);
        assert_eq!(template.formula_at(2).unwrap(), book.sheet(0).unwrap().get_formula("B3").unwrap());
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Text("Below".into()));
        assert_eq!(book.get_cell("Sheet1", "A6"), Value::Null);
        assert_eq!(book.get_cell("Report", "A2"), Value::Number(6.));
        history.redo(&mut book).unwrap();
    }
    history.set_cell_input(&mut book, 0, "A4", "4").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(8.));
}

#[test]
fn insertion_rejects_canvas_overflow_without_consuming_redo_or_mutating() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "D5", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    assert!(history.set_table_headers(&mut book, "Orders", true, 5).unwrap_err().contains("outside"));
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Text("Below".into()));
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn only_references_wholly_inside_the_inserted_column_band_shift() {
    let (mut book, mut history) = seed();
    for (address, formula) in [("E1", "=SUM(A1:A2)"), ("E2", "=SUM(A1:D2)"),
        ("E3", "=SUM(A:A)"), ("E4", "=SUM(A2:A1)"), ("E5", "=IF(TRUE,A1,D2)")] {
        book.set_formula(0, address, formula);
    }
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for (address, formula) in [("E1", "=SUM(A2:A3)"), ("E2", "=SUM(A1:D2)"),
        ("E3", "=SUM(A:A)"), ("E4", "=SUM(A3:A2)"), ("E5", "=IF(TRUE,A2,D2)")] {
        assert_eq!(book.sheet(0).unwrap().get_formula(address).as_deref(), Some(formula));
    }
}

#[test]
fn cell_styles_move_but_row_heights_and_column_widths_do_not() {
    use einfach_excel_core::{CellStyle, cell_style::StyleScope};
    let (mut book, mut history) = seed();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.patch_format_range(range("B1", "B1"), StyleScope::Cell,
        CellStyle { bold: Some(true), ..Default::default() });
    sheet.set_row_height(0, 48);
    sheet.set_row_height(1, 25);
    sheet.set_col_width(1, 160);
    let before = sheet.snapshot_format_range(range("A1", "D6"));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    let sheet = book.sheet(0).unwrap();
    let after = sheet.snapshot_format_range(range("A1", "D6"));
    assert_eq!(after.row_styles, before.row_styles);
    assert_eq!(after.column_styles, before.column_styles);
    assert_eq!(after.cell_styles, vec![(CellAddress::parse("B2").unwrap(), before.cell_styles[0].1.clone())]);
    assert_eq!(sheet.row_height(0), Some(48));
    assert_eq!(sheet.row_height(1), Some(25));
    assert_eq!(sheet.col_width(1), Some(160));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "D6")), before);
}

#[test]
fn insertion_publishes_only_final_values_and_external_edits_reject_undo() {
    use std::{cell::Cell, rc::Rc};
    let (mut book, mut history) = seed();
    let calls = Rc::new(Cell::new(0));
    let counter = calls.clone();
    book.sheet_mut(0).unwrap().subscribe_cell("A1", move || counter.set(counter.get() + 1));
    calls.set(0);
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(calls.replace(0), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(calls.replace(0), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(calls.replace(0), 1);
    book.set_cell(0, "A6", Value::Text("New external value".into()));
    let before = book.snapshot_tables();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A6"), Value::Text("New external value".into()));
    assert_eq!(calls.get(), 0);
    assert_eq!(history.undo_count(), 1);
}
