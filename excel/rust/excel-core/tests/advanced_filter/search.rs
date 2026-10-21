use super::groups::{equals, example, group, range, seed};
use einfach_core::Value;
use einfach_excel_core::workbook::FilterValuesQuery;
use einfach_excel_core::Workbook;

fn query(search: &str) -> FilterValuesQuery<'_> {
    FilterValuesQuery { column: 0, table: None, search, offset: 0, limit: 50 }
}

#[test]
fn one_query_returns_every_search_match_across_pages_without_mutation() {
    let mut book = Workbook::new();
    for row in 1..=1000 {
        book.set_cell(0, &format!("A{}", row + 1), Value::Text(format!("Order {row:04}")));
    }
    book.apply_filter_range(0, range("A1", "B1001"), &[]).unwrap();
    let before = book.snapshot_filters();
    let page = book.filter_values(0, query("Order")).unwrap();
    assert_eq!((page.total, page.values.len()), (1000, 50));
    let all = book.filter_all_values(0, query("ORDER")).unwrap();
    assert_eq!((all.total, all.values.len(), all.offset), (1000, 1000, 0));
    assert_eq!(all.values[999].value, "Order 1000");
    assert_eq!(book.snapshot_filters(), before);
}

#[test]
fn all_match_count_text_and_scan_budgets_reject_rather_than_truncate() {
    let mut book = Workbook::new();
    for row in 1..=1001 { book.set_cell(0, &format!("A{}", row + 1), Value::Text(format!("Item {row}"))); }
    book.apply_filter_range(0, range("A1", "A1002"), &[]).unwrap();
    assert_eq!(book.filter_values(0, query("")).unwrap().total, 1001);
    assert!(book.filter_all_values(0, query("")).unwrap_err().contains("1,000"));
    assert_eq!(book.filter_all_values(0, query("Item 1001")).unwrap().total, 1);
    assert!(book.filter_all_values(0, FilterValuesQuery { offset: 1, ..query("") }).is_err());
    for row in 1..=40 { book.set_cell(0, &format!("B{}", row + 1), Value::Text(format!("{row}{}", "x".repeat(30_000)))); }
    book.apply_filter_range(0, range("A1", "B1002"), &[]).unwrap();
    assert!(book.filter_all_values(0, FilterValuesQuery { column: 1, ..query("") }).unwrap_err().contains("1 MiB"));
    book.apply_filter_range(0, range("A1", "A50002"), &[]).unwrap();
    assert!(book.filter_all_values(0, query("")).unwrap_err().contains("50,000"));
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn candidate_queries_remove_the_current_column_from_each_or_group() {
    let mut book = seed();
    book.apply_filter_range_groups(0, range("A1", "B5"), &example()).unwrap();
    let page = book.filter_all_values(0, query("")).unwrap();
    assert_eq!(page.values.iter().map(|value| (value.value.as_str(), value.count)).collect::<Vec<_>>(),
        vec![("East", 2), ("West", 2)]);
    book.apply_filter_range_groups(0, range("A1", "B5"), &[
        group(vec![equals(0, "West"), equals(1, "20")]), group(vec![equals(0, "East")]),
    ]).unwrap();
    assert_eq!(book.filter_all_values(0, query("")).unwrap().values.iter().map(|value| value.count).sum::<u32>(), 4,
        "a branch with only the queried column places no other restriction on candidates");
}

#[test]
fn zero_matches_and_exact_blank_multiline_case_preserve_list_membership() {
    let mut book = seed();
    book.set_cell(0, "A3", Value::Text("west\nsecond line".into()));
    book.clear_cell(0, "A5");
    book.apply_filter_range(0, range("A1", "B5"), &[]).unwrap();
    let all = book.filter_all_values(0, query("WEST")).unwrap();
    assert_eq!(all.total, 2);
    assert!(all.values.iter().any(|entry| entry.value == "west\nsecond line"));
    let empty = book.filter_all_values(0, query("missing")).unwrap();
    assert_eq!(empty.total, 0); assert!(empty.values.is_empty());
    assert!(book.filter_all_values(0, query("")).unwrap().values.iter().any(|entry| entry.value.is_empty()));
}
