//! 零数据行的表头切换不能把汇总或相邻单元格纳入数据区。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}

fn seed(first_row: u32, headers: bool) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let last_row = first_row + u32::from(headers);
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1",
            CellRange::new(CellAddress::new(first_row, 0), CellAddress::new(last_row, 1)),
            headers, true, vec!["Item".into(), "Amount".into()]),
    ])).unwrap();
    if headers {
        book.set_cell(0, &format!("A{}", first_row + 1), Value::Text("Item".into()));
        book.set_cell(0, &format!("B{}", first_row + 1), Value::Text("Amount".into()));
    }
    book.set_cell(0, &format!("B{}", last_row + 1), Value::Number(99.));
    book.set_cell(0, &format!("A{}", last_row + 2), Value::Text("Outside".into()));
    book.set_formula(0, "D1", "=Orders[Amount]");
    book.set_formula(0, "D2", "=Orders[[#Totals],[Amount]]");
    (book, WorkbookHistory::default())
}

#[test]
fn headers_and_totals_without_data_hide_show_and_undo_without_consuming_neighbors() {
    let (mut book, mut history) = seed(2, true);
    let original = book.snapshot_tables();
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
    history.set_table_headers(&mut book, "Orders", false, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A4", "B4"));
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(99.));
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Text("Outside".into()));
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
        assert_eq!(book.get_cell("Sheet1", "D2"), Value::Number(99.));
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Amount".into()));
        history.redo(&mut book).unwrap();
    }
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(history.undo_count(), 2);
}

#[test]
fn totals_at_first_grid_row_are_not_data_and_can_receive_headers_by_insertion() {
    let (mut book, mut history) = seed(0, false);
    let original = book.snapshot_tables();
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B2"));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("Amount".into()));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Outside".into()));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), original);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(99.));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "D2"), Value::Number(99.));
}

#[test]
fn removing_the_last_visible_totals_row_cannot_underflow_or_leave_an_inverted_range() {
    for row in [0, 3] {
        let (mut book, mut history) = seed(row, false);
        history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
        history.undo(&mut book).unwrap();
        let original = book.snapshot_tables();
        // 在无可见行的 Table 尚未有明确表示前，必须在任何写入前拒绝。
        assert!(history.set_table_totals_row(&mut book, "Orders", false).is_err());
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", &format!("B{}", row + 1)), Value::Number(99.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
        assert!(book.set_table_totals_row("Orders", false).is_err());
        assert_eq!(book.snapshot_tables(), original);
    }
}
