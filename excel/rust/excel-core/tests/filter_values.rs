//! 候选列表读真实原生数据，不依赖视口，不修改筛选快照或历史。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};
use einfach_excel_core::workbook::FilterValuesQuery;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn query(column: u32) -> FilterValuesQuery<'static> {
    FilterValuesQuery { column, table: None, search: "", offset: 0, limit: 50 }
}
fn seed() -> Workbook {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Region".into()));
    for (row, text, number) in [(2, "West", 1.), (3, "East", 2.), (4, "West", 3.), (5, "", 4.)] {
        if !text.is_empty() { book.set_cell(0, &format!("A{row}"), Value::Text(text.into())); }
        book.set_cell(0, &format!("B{row}"), Value::Number(number));
    }
    book.apply_filter_range(0, range("A1", "B5"), &[]).unwrap();
    book
}

#[test]
fn list_counts_blank_and_offscreen_values_and_searches_before_paging() {
    let mut book = seed();
    book.set_cell(0, "A1001", Value::Text("末尾 ΩMEGA\nsecond line".into()));
    book.apply_filter_range(0, range("A1", "B1001"), &[]).unwrap();
    let filters = book.snapshot_filters();
    let page = book.filter_values(0, query(0)).unwrap();
    assert_eq!(page.total, 4);
    assert_eq!(page.values.iter().map(|item| (item.value.as_str(), item.count)).collect::<Vec<_>>(),
        vec![("", 996), ("East", 1), ("West", 2), ("末尾 ΩMEGA\nsecond line", 1)]);
    assert_eq!(page.values.iter().map(|item| item.count).sum::<u32>(), 1000);
    let page = book.filter_values(0, FilterValuesQuery { search: "ωmega", limit: 1, ..query(0) }).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.values[0].value, "末尾 ΩMEGA\nsecond line");
    let page = book.filter_values(0, FilterValuesQuery { offset: 2, limit: 1, ..query(0) }).unwrap();
    assert_eq!(page.total, 4); assert_eq!(page.offset, 2); assert_eq!(page.values[0].value, "West");
    assert_eq!(book.snapshot_filters(), filters);
}

#[test]
fn current_column_is_not_self_filtered_but_other_conditions_apply() {
    let mut book = seed();
    book.apply_filter_range(0, range("A1", "B5"), &[
        ColumnFilterRule::List { col_index: 0, values: vec!["West".into()] },
        ColumnFilterRule::Range { col_index: 1, min: Some(2.), max: None },
    ]).unwrap();
    let filters = book.snapshot_filters();
    let page = book.filter_values(0, query(0)).unwrap();
    assert_eq!(page.values.iter().map(|item| item.value.as_str()).collect::<Vec<_>>(), vec!["", "East", "West"]);
    assert_eq!(page.values[2].count, 1);
    let page = book.filter_values(0, query(1)).unwrap();
    assert_eq!(page.values.iter().map(|item| item.value.as_str()).collect::<Vec<_>>(), vec!["1", "3"]);
    assert_eq!(book.snapshot_filters(), filters);
}

#[test]
fn table_excludes_headers_totals_and_other_scopes_without_reapplying_them() {
    let mut book = seed();
    book.clear_filter(0).unwrap();
    book.define_table(Some("Orders"), 0, range("A1", "B5"), true).unwrap();
    book.set_table_totals_row("Orders", true).unwrap();
    book.apply_table_filter("Orders", &[ColumnFilterRule::List { col_index: 0, values: vec!["West".into()] }]).unwrap();
    book.apply_filter_range(0, range("D1", "D5"), &[ColumnFilterRule::Range {
        col_index: 3, min: Some(1.), max: None,
    }]).unwrap();
    let query = FilterValuesQuery { table: Some("Orders"), ..query(0) };
    assert_eq!(book.filter_values(0, query).unwrap().total, 0);
    // 普通区域快照仍隐藏这一行，编辑值不能被候选查询偷偷重新应用。
    book.set_cell(0, "D3", Value::Number(10.));
    let query = FilterValuesQuery { table: Some("Orders"), ..self::query(0) };
    assert_eq!(book.filter_values(0, query).unwrap().total, 0);
    book.clear_filter(0).unwrap();
    let before = book.snapshot_tables();
    let query = FilterValuesQuery { table: Some("orders"), ..self::query(0) };
    let page = book.filter_values(0, query).unwrap();
    assert_eq!(page.total, 3);
    assert_eq!(page.values.iter().map(|item| item.count).sum::<u32>(), 4);
    assert_eq!(book.snapshot_tables(), before);
}

#[test]
fn all_pages_cover_more_than_a_thousand_distinct_values_without_truncating() {
    let mut book = Workbook::new();
    for row in 1..=1200 { book.set_cell(0, &format!("A{}", row + 1), Value::Text(format!("Item {row:04}"))); }
    book.apply_filter_range(0, range("A1", "A1201"), &[]).unwrap();
    let mut values = Vec::new();
    for offset in (0..1200).step_by(100) {
        let page = book.filter_values(0, FilterValuesQuery { offset, limit: 100, ..query(0) }).unwrap();
        assert_eq!(page.total, 1200); values.extend(page.values.into_iter().map(|entry| entry.value));
    }
    assert_eq!(values.len(), 1200);
    assert_eq!(values[1199], "Item 1200");
    assert!(values.windows(2).all(|pair| pair[0] < pair[1]));
}

#[test]
fn invalid_scope_and_budget_reject_without_mutation_and_empty_pages_are_explicit() {
    let mut book = seed();
    let before = book.snapshot_filters();
    assert!(book.filter_values(99, query(0)).is_err());
    assert!(book.filter_values(0, query(2)).is_err());
    assert!(book.filter_values(0, FilterValuesQuery { table: Some("Missing"), ..query(0) }).is_err());
    assert!(book.filter_values(0, FilterValuesQuery { limit: 0, ..query(0) }).is_err());
    assert!(book.filter_values(0, FilterValuesQuery { limit: 101, ..query(0) }).is_err());
    assert!(book.filter_values(0, FilterValuesQuery { search: &"😀".repeat(16384), ..query(0) }).is_err());
    let page = book.filter_values(0, FilterValuesQuery { search: "absent", ..query(0) }).unwrap();
    assert_eq!(page.total, 0); assert!(page.values.is_empty());
    let page = book.filter_values(0, FilterValuesQuery { offset: u32::MAX, ..query(0) }).unwrap();
    assert_eq!(page.offset, page.total); assert!(page.values.is_empty());
    assert_eq!(book.snapshot_filters(), before);
    book.apply_filter_range(0, range("A1", "A50002"), &[]).unwrap();
    assert!(book.filter_values(0, query(0)).unwrap_err().contains("50,000"));
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn native_value_text_roundtrips_through_list_rules_including_hidden_rows_and_formula_values() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Value".into()));
    book.set_cell(0, "A2", Value::Number(42.));
    book.set_cell(0, "A3", Value::Boolean(true));
    book.set_formula(0, "A4", "=1/0");
    book.set_formula(0, "A5", "=21*2");
    book.set_cell(0, "A6", Value::Text("two\nlines".into()));
    book.apply_filter_range(0, range("A1", "A7"), &[]).unwrap();
    book.hide_rows(0, &[1, 2]);
    let page = book.filter_values(0, query(0)).unwrap();
    assert_eq!(page.values.iter().map(|item| (item.value.as_str(), item.count)).collect::<Vec<_>>(),
        vec![("", 1), ("#DIV/0!", 1), ("42", 2), ("TRUE", 1), ("two\nlines", 1)]);
    for entry in page.values {
        let report = book.apply_filter_range(0, range("A1", "A7"), &[
            ColumnFilterRule::List { col_index: 0, values: vec![entry.value] },
        ]).unwrap();
        assert_eq!(6 - report.hidden_rows.len() as u32, entry.count);
    }
}

#[test]
fn scope_validation_empty_tables_and_legacy_summary_rows_match_the_filter_engine() {
    let mut book = Workbook::new();
    assert_eq!(book.filter_values(0, query(0)).unwrap().total, 0);
    book.set_cell(0, "A1", Value::Text("Header".into()));
    book.set_cell(0, "A2", Value::Text("Member".into()));
    book.set_cell(0, "A3", Value::Text("Total".into()));
    let page = book.filter_values(0, query(0)).unwrap();
    assert_eq!(page.total, 1); assert_eq!(page.values[0].value, "Member");
    book.define_table(Some("Orders"), 0, range("A1", "A3"), true).unwrap();
    // 显式 Table 的 Total 是普通记录，不套用旧整表的末行启发式。
    assert_eq!(book.filter_values(0, FilterValuesQuery { table: Some("Orders"), ..query(0) }).unwrap().total, 2);
    book.add_sheet("Other");
    assert!(book.filter_values(1, FilterValuesQuery { table: Some("Orders"), ..query(0) }).is_err());
    book.define_table(Some("EmptyOrders"), 1, range("A1", "A1"), true).unwrap();
    assert_eq!(book.filter_values(1, FilterValuesQuery { table: Some("EmptyOrders"), ..query(0) }).unwrap().total, 0);
}
