//! 零数据行的表头切换不能把汇总或相邻单元格纳入数据区。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, TableColumnFormula, Workbook};
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
        history.set_table_totals_row(&mut book, "Orders", false).unwrap();
        let empty = book.snapshot_tables();
        assert!(book.get_table("Orders").unwrap().has_insert_row());
        assert_eq!(book.get_cell("Sheet1", &format!("B{}", row + 1)), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Error(ValueError::InvalidRef));
        assert_eq!(history.undo_count(), 1);
        assert_eq!(history.redo_count(), 0);
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", &format!("B{}", row + 1)), Value::Number(99.));
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_tables(), empty);
        book.set_table_totals_row("Orders", true).unwrap();
        assert_eq!(book.snapshot_tables(), original);
        assert_eq!(book.get_cell("Sheet1", &format!("A{}", row + 2)), Value::Text("Outside".into()));
    }
}

#[test]
fn sole_header_or_total_reuses_its_row_even_at_both_grid_edges() {
    for row in [0, 3, 1_048_575] {
        for headers in [true, false] {
            let mut book = Workbook::new();
            let bounds = CellRange::new(CellAddress::new(row, 0), CellAddress::new(row, 1));
            book.restore_tables(TableRegistrySnapshot::from_entries(vec![
                TableEntry::from_parts("Orders", "Sheet1", bounds, headers, !headers,
                    vec!["Item".into(), "Amount".into()]),
            ])).unwrap();
            let address = format!("B{}", row + 1);
            book.set_cell(0, &address, Value::Text(if headers { "Amount" } else { "Total" }.into()));
            let neighbors: Vec<_> = [row.checked_sub(1), row.checked_add(1).filter(|r| *r < 1_048_576)]
                .into_iter().flatten().map(|r| format!("B{}", r + 1)).collect();
            for neighbor in &neighbors { book.set_cell(0, neighbor, Value::Number(77.)); }
            book.add_sheet("Report");
            book.set_formula(1, "A1", "=ROWS(Orders[Amount])");
            let original = book.snapshot_tables();
            let mut history = WorkbookHistory::default();
            if headers { history.set_table_headers(&mut book, "Orders", false, 1_048_576).unwrap(); }
            else { history.set_table_totals_row(&mut book, "Orders", false).unwrap(); }
            let empty = book.snapshot_tables();
            for _ in 0..2 {
                let table = book.get_table("Orders").unwrap();
                assert_eq!(table.range(), bounds);
                assert!(table.has_insert_row());
                assert_eq!(book.get_cell("Sheet1", &address), Value::Null);
                assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
                history.undo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), original);
                history.redo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), empty);
            }
            if headers { history.set_table_headers(&mut book, "Orders", true, 1_048_576).unwrap(); }
            else { history.set_table_totals_row(&mut book, "Orders", true).unwrap(); }
            assert_eq!(book.snapshot_tables(), original);
            assert_eq!(book.get_cell("Report", "A1"), Value::Error(ValueError::InvalidRef));
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), empty);
            for neighbor in &neighbors { assert_eq!(book.get_cell("Sheet1", neighbor), Value::Number(77.)); }
        }
    }
}

#[test]
fn header_and_total_reuse_the_input_row_but_not_a_blank_data_record() {
    for headers in [true, false] {
        for insert_row in [true, false] {
            let mut book = Workbook::new();
            let original_range = range("A3", "B4");
            book.restore_tables(TableRegistrySnapshot::from_entries(vec![
                TableEntry::from_parts("Orders", "Sheet1", original_range, headers, !headers,
                    vec!["Item".into(), "Amount".into()]).with_insert_row(insert_row),
            ])).unwrap();
            let mut history = WorkbookHistory::default();
            let original = book.snapshot_tables();
            if headers { history.set_table_totals_row(&mut book, "Orders", true).unwrap(); }
            else { history.set_table_headers(&mut book, "Orders", true, 100).unwrap(); }
            let table = book.get_table("Orders").unwrap();
            assert!(table.has_headers() && table.has_totals() && !table.has_insert_row());
            assert_eq!(table.range(), if insert_row { original_range }
                else if headers { range("A3", "B5") } else { range("A2", "B4") });
            history.undo(&mut book).unwrap();
            assert_eq!(book.snapshot_tables(), original);
        }
    }
}

#[test]
fn visibility_keeps_calculated_templates_for_the_first_real_input() {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts("Orders", "Sheet1", range("A3", "B3"), true, false,
            vec!["Qty".into(), "Amount".into()]).with_calculated_columns(vec![None,
                Some(TableColumnFormula::new(2, "=[@Qty]*2").unwrap())]),
    ])).unwrap();
    book.set_cell(0, "A3", Value::Text("Qty".into()));
    book.set_cell(0, "B3", Value::Text("Amount".into()));
    let mut history = WorkbookHistory::default();
    history.set_table_headers(&mut book, "Orders", false, 3).unwrap();
    let empty = book.snapshot_tables();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    history.set_table_totals_row(&mut book, "Orders", false).unwrap();
    history.set_table_headers(&mut book, "Orders", true, 3).unwrap();
    history.set_table_headers(&mut book, "Orders", false, 3).unwrap();
    assert_eq!(book.snapshot_tables(), empty);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    history.set_cell_input(&mut book, 0, "A3", "7").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(14.));
    assert_eq!(history.undo_count(), 6);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), empty);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(14.));
}
