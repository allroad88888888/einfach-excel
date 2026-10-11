//! Table 条件与普通区域条件独立；可见性是各作用域隐藏行的并集。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(CellAddress::parse(first).unwrap(), CellAddress::parse(last).unwrap())
}
fn minimum(col: u32, min: f64) -> ColumnFilterRule {
    ColumnFilterRule::Range { col_index: col, min: Some(min), max: None }
}
fn seed() -> Workbook {
    let mut book = Workbook::new();
    for (name, start) in [("North", 1), ("South", 6)] {
        book.set_cell(0, &format!("A{start}"), Value::Text("Qty".into()));
        for offset in 1..=3 {
            book.set_cell(0, &format!("A{}", start + offset), Value::Number(offset as f64));
        }
        book.define_table(Some(name), 0, range(&format!("A{start}"), &format!("B{}", start + 3)), true).unwrap();
    }
    book.set_formula(0, "D1", "=SUBTOTAL(9,North[Qty])");
    book
}

#[test]
fn table_scopes_coexist_and_clearing_one_does_not_clear_other_filters() {
    let mut book = seed();
    book.apply_table_filter("North", &[minimum(0, 2.)]).unwrap();
    book.apply_table_filter("South", &[minimum(0, 3.)]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 6, 7]);
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(5.));
    assert!(book.filter_rules(0).is_empty());
    book.apply_filter_range(0, range("D11", "D13"), &[minimum(3, 1.)]).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 6, 7, 11, 12]);
    book.clear_table_filter("North").unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![6, 7, 11, 12]);
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(6.));
    book.clear_filter(0).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![6, 7]);
    assert_eq!(book.get_table("South").unwrap().auto_filter().unwrap().rules(), &[minimum(0, 3.)]);
}

#[test]
fn reapply_is_explicit_and_does_not_rescan_other_tables() {
    let mut book = seed();
    book.apply_table_filter("North", &[minimum(0, 2.)]).unwrap();
    let scans = book.debug_filter_scan_count(0);
    book.set_cell(0, "A2", Value::Number(4.));
    assert_eq!(book.filter_hidden_rows(0), vec![1]);
    assert_eq!(book.debug_filter_scan_count(0), scans);
    assert_eq!(book.reapply_table_filter("North").unwrap().hidden_rows, Vec::<u32>::new());
    assert_eq!(book.debug_filter_scan_count(0), scans + 1);
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn headers_totals_and_cells_outside_the_table_are_not_filter_candidates() {
    let mut book = seed();
    book.set_table_totals_row("North", true).unwrap();
    let report = book.apply_table_filter("North", &[minimum(0, 3.)]).unwrap();
    assert_eq!(report.scanned_rows, 3);
    assert_eq!(report.hidden_rows, vec![1, 2]);
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(3.));
    let before = book.snapshot_tables();
    assert!(book.apply_table_filter("North", &[minimum(2, 3.)]).is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
}
