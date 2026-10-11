//! 排序选项只改变比较，不改变原生置换、样式、筛选快照或公式搬移路径。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Sheet, SortDirection, SortKey};

fn range() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(5, 2))
}
fn key(col: u32, case_sensitive: bool, empty_first: bool, descending: bool) -> SortKey {
    SortKey { col, case_sensitive, empty_first, direction: if descending {
        SortDirection::Descending
    } else { SortDirection::Ascending } }
}
fn seed() -> Sheet {
    let mut sheet = Sheet::new();
    for (i, (text, score)) in [(Some("cedar"), 2.), (Some("Birch"), 1.),
        (Some("CEDAR"), 1.), (None, 3.), (None, 1.), (Some("cedar"), 1.)].iter().enumerate() {
        let row = i + 1;
        if let Some(text) = text { sheet.set_cell(&format!("A{row}"), Value::Text((*text).into())); }
        sheet.set_cell(&format!("B{row}"), Value::Number(*score));
        sheet.set_cell(&format!("C{row}"), Value::Number(i as f64));
    }
    sheet
}
fn ids(sheet: &Sheet) -> Vec<f64> {
    (1..=6).map(|row| match sheet.get_cell(&format!("C{row}")) {
        Value::Number(value) => value, other => panic!("unexpected record: {other:?}"),
    }).collect()
}

#[test]
fn case_sensitive_and_insensitive_sort_are_stable_in_both_directions() {
    for (case, desc, expected) in [
        (false, false, vec![1., 0., 2., 5., 3., 4.]),
        (true, false, vec![1., 2., 0., 5., 3., 4.]),
        (false, true, vec![0., 2., 5., 1., 3., 4.]),
        (true, true, vec![0., 5., 2., 1., 3., 4.]),
    ] {
        let mut sheet = seed();
        sheet.sort_range(range(), &[key(0, case, false, desc)], &[]).unwrap();
        assert_eq!(ids(&sheet), expected);
        assert_eq!(sheet.sort_range(range(), &[key(0, case, false, desc)], &[]).unwrap().moved_rows, 0);
    }
}

#[test]
fn empty_position_is_independent_of_direction_and_empty_ties_use_the_next_key() {
    for (first, desc, expected) in [
        (true, false, vec![4., 3., 1., 2., 5., 0.]),
        (true, true, vec![4., 3., 2., 5., 0., 1.]),
        (false, false, vec![1., 2., 5., 0., 4., 3.]),
        (false, true, vec![2., 5., 0., 1., 4., 3.]),
    ] {
        let mut sheet = seed();
        sheet.sort_range(range(), &[key(0, false, first, desc), key(1, false, first, false)], &[]).unwrap();
        assert_eq!(ids(&sheet), expected);
    }
}

#[test]
fn changing_key_priority_changes_the_record_order_not_the_direction_of_each_key() {
    let mut sheet = seed();
    sheet.sort_range(range(), &[key(1, false, true, false), key(0, true, true, false)], &[]).unwrap();
    assert_eq!(ids(&sheet), vec![4., 1., 2., 5., 0., 3.]);
}

#[test]
fn empty_text_and_empty_formula_results_are_text_not_empty_cells() {
    let mut sheet = seed();
    sheet.set_cell("A1", Value::Text("".into()));
    sheet.set_formula("A2", "=\"\"");
    sheet.set_cell("A3", Value::Text(" ".into()));
    sheet.sort_range(range(), &[key(0, false, true, false)], &[]).unwrap();
    assert_eq!(ids(&sheet), vec![3., 4., 0., 1., 2., 5.]);
    // 显示为空的公式仍作为公式搬移，不被空格策略清除。
    assert_eq!(sheet.get_cell("A4"), Value::Text("".into()));
}

#[test]
fn excluded_rows_keep_their_slots_with_empty_first_and_case_sensitive_keys() {
    let mut sheet = seed();
    sheet.sort_range(range(), &[key(0, true, true, false)], &[2]).unwrap();
    assert_eq!(ids(&sheet), vec![3., 4., 2., 1., 0., 5.]);
}
