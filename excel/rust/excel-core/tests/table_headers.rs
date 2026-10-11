//! 表头内容、范围与筛选是一个原子历史动作；隐藏不移动数据行。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    for (address, value) in [("A3", "Product"), ("B3", "Amount"), ("A4", "One"), ("A5", "Two")] {
        wb.set_cell(0, address, Value::Text(value.into()));
    }
    wb.set_cell(0, "B4", Value::Number(10.));
    wb.set_cell(0, "B5", Value::Number(20.));
    wb.define_table(Some("Orders"), 0, range("A3", "B5"), true).unwrap();
    wb.set_formula(0, "D1", "=SUM(Orders[Amount])");
    wb.set_formula(0, "D2", "=Orders[[#Headers],[Amount]]");
    let report = wb.add_sheet("Report");
    wb.set_formula(report, "A1", "=Orders[#Headers]");
    wb.set_formula(report, "A3", "=SUM(Orders[#Data])");
    assert_eq!(wb.get_cell("Report", "B1"), Value::Text("Amount".into()));
    (wb, WorkbookHistory::default())
}

#[test]
fn hide_show_and_history_preserve_body_and_restore_header_references() {
    let (mut wb, mut history) = seed();
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    assert_eq!(history.undo_count(), 1);
    for _ in 0..2 {
        let table = wb.get_table("Orders").unwrap();
        assert!(!table.has_headers());
        assert_eq!(table.range(), range("A4", "B5"));
        assert_eq!(table.columns(), &["Product", "Amount"]);
        assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
        assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(30.));
        assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(0.));
        let Value::Array(headers) = wb.get_cell("Report", "A1") else {
            panic!("The two-column header reference must retain its array shape");
        };
        assert_eq!(headers.shape(), (1, 2));
        assert_eq!(headers.get(0, 0), Some(&Value::Number(0.)));
        assert_eq!(headers.get(0, 1), Some(&Value::Number(0.)));
        assert_eq!(wb.get_cell("Report", "B1"), Value::Number(0.));
        assert_eq!(wb.get_cell("Report", "A3"), Value::Number(30.));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Product".into()));
        assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Text("Amount".into()));
        assert_eq!(wb.get_cell("Report", "B1"), Value::Text("Amount".into()));
        assert!(!history.set_table_headers(&mut wb, "Orders", true).unwrap());
        assert_eq!(history.redo_count(), 1);
        history.redo(&mut wb).unwrap();
    }
    history.rename_table_column(&mut wb, "Orders", "Amount", "Net").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Number(10.));
    history.set_table_headers(&mut wb, "Orders", true).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Text("Net".into()));
    assert_eq!(wb.get_cell("Report", "B1"), Value::Text("Net".into()));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(30.));
}

#[test]
fn hiding_removes_only_the_owned_filter_and_undo_restores_its_snapshot() {
    let (mut wb, mut history) = seed();
    let bounds = range("A3", "B5");
    wb.apply_filter_range(0, bounds, &[ColumnFilterRule::Range {
        col_index: 1, min: Some(15.), max: None,
    }]).unwrap();
    wb.hide_rows(0, &[4]);
    wb.set_formula(0, "D3", "=SUBTOTAL(9,Orders[Amount])");
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(20.));
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    assert_eq!(wb.filter_range(0), None);
    assert!(wb.filter_hidden_rows(0).is_empty());
    assert_eq!(wb.list_hidden_rows(0), vec![4]);
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(30.));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.filter_range(0), Some(bounds));
    assert_eq!(wb.filter_hidden_rows(0), vec![3]);
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(20.));
    history.redo(&mut wb).unwrap();
    history.set_table_headers(&mut wb, "Orders", true).unwrap();
    assert_eq!(wb.filter_range(0), None, "showing is not undoing the earlier filter removal");
}

#[test]
fn unrelated_filter_and_data_in_the_header_destination_are_not_overwritten() {
    let (mut wb, mut history) = seed();
    let outside = range("F3", "G5");
    wb.apply_filter_range(0, outside, &[]).unwrap();
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    assert_eq!(wb.filter_range(0), Some(outside));
    wb.set_cell(0, "A3", Value::Text("Outside data".into()));
    let tables = wb.snapshot_tables();
    assert!(history.set_table_headers(&mut wb, "Orders", true).unwrap_err().contains("occupied"));
    assert_eq!(wb.snapshot_tables(), tables);
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Outside data".into()));
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).is_err(), "history must not overwrite an external cell edit");
    assert_eq!(wb.snapshot_tables(), tables);
}

#[test]
fn deleting_first_data_row_does_not_destroy_a_headerless_table() {
    let (mut wb, mut history) = seed();
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    history.edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 3, count: 1 }).unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A4", "B4"));
    assert!(!wb.get_table("Orders").unwrap().has_headers());
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(20.));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A4", "B5"));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(30.));
    history.undo(&mut wb).unwrap();
    assert!(wb.get_table("Orders").unwrap().has_headers());
}

#[test]
fn converting_headerless_tables_keeps_zero_header_values_and_data_references() {
    let (mut wb, mut history) = seed();
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    history.convert_table_to_range(&mut wb, "Orders").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(0.));
    assert_eq!(wb.get_cell("Report", "B1"), Value::Number(0.));
    assert_eq!(wb.get_cell("Report", "A3"), Value::Number(30.));
    history.undo(&mut wb).unwrap();
    history.set_table_headers(&mut wb, "Orders", true).unwrap();
    assert_eq!(wb.get_cell("Report", "B1"), Value::Text("Amount".into()));
}

#[test]
fn external_filter_change_rejects_undo_before_restoring_cells_or_table() {
    let (mut wb, mut history) = seed();
    wb.apply_filter_range(0, range("A3", "B5"), &[]).unwrap();
    history.set_table_headers(&mut wb, "Orders", false).unwrap();
    let outside = range("F3", "G5");
    wb.apply_filter_range(0, outside, &[]).unwrap();
    let tables = wb.snapshot_tables();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.snapshot_tables(), tables);
    assert_eq!(wb.filter_range(0), Some(outside));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(history.undo_count(), 1);
}
