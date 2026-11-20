use std::sync::Arc;
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Sheet, SortDirection, SortKey};
use einfach_excel_core::sort_custom_list::{CustomList, CustomListError};

fn list(values: &[&str], locale: &str) -> CustomList {
    CustomList::new(&values.iter().map(|v| v.to_string()).collect::<Vec<_>>(), locale).unwrap()
}
fn range(rows: u32) -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(rows - 1, 2))
}
fn key(values: &[&str]) -> SortKey {
    SortKey { custom_list: Some(Arc::new(list(values, "en"))), ..SortKey::default() }
}
fn seed() -> Sheet {
    let mut sheet = Sheet::new();
    for (row, value) in [Value::Text("High".into()), Value::Text("zebra".into()),
        Value::Number(1.), Value::Null, Value::Text("low".into()), Value::Text("Low".into()),
        Value::Text("apple".into()), Value::Boolean(false), Value::Text("1".into()),
        Value::Text("".into())].into_iter().enumerate() {
        sheet.set_cell(&format!("A{}", row + 1), value);
        sheet.set_cell(&format!("B{}", row + 1), Value::Number(row as f64));
    }
    sheet
}
fn ids(sheet: &Sheet, rows: usize) -> Vec<usize> {
    (1..=rows).map(|r| match sheet.get_cell(&format!("B{r}")) {
        Value::Number(n) => n as usize, other => panic!("bad record {other:?}"),
    }).collect()
}

#[test]
fn list_rank_preserves_ties_and_only_matches_text_with_unknown_type_fallback() {
    let mut sheet = seed();
    sheet.sort_range(range(10), &[key(&["Low", "High", "1"])], &[]).unwrap();
    assert_eq!(ids(&sheet, 10), vec![4, 5, 0, 8, 2, 9, 6, 1, 7, 3]);
    assert_eq!(sheet.sort_range(range(10), &[key(&["Low", "High", "1"])], &[])
        .unwrap().moved_rows, 0);
}

#[test]
fn descending_reverses_nonempty_order_while_empty_position_stays_independent() {
    for (first, expected) in [(false, vec![7, 1, 6, 9, 2, 8, 0, 4, 5, 3]),
        (true, vec![3, 7, 1, 6, 9, 2, 8, 0, 4, 5])] {
        let mut sheet = seed();
        let key = SortKey { direction: SortDirection::Descending, empty_first: first,
            ..key(&["Low", "High", "1"]) };
        sheet.sort_range(range(10), &[key], &[]).unwrap();
        assert_eq!(ids(&sheet, 10), expected);
    }
}

#[test]
fn a_secondary_key_breaks_list_ties_and_excluded_rows_keep_their_slots() {
    let mut sheet = seed();
    let second = SortKey { col: 1, direction: SortDirection::Descending, ..SortKey::default() };
    sheet.sort_range(range(10), &[key(&["Low", "High", "1"]), second], &[0, 8]).unwrap();
    assert_eq!(ids(&sheet, 10), vec![0, 5, 4, 2, 9, 6, 1, 7, 8, 3]);
}

#[test]
fn case_mode_can_change_without_rebuilding_ranks_and_host_whitespace_is_not_trimmed() {
    let list = list(&[" Low ", "High"], "en");
    assert_eq!(list.rank(" low ", false), Some(0));
    assert_eq!(list.rank("Low", false), None);
    assert_eq!(list.rank(" Low ", true), Some(0));
    assert_eq!(list.rank(" low ", true), None);
    let mut sheet = seed();
    sheet.sort_range(range(10), &[SortKey { case_sensitive: true,
        ..key(&["Low", "High"]) }], &[]).unwrap();
    assert_eq!(&ids(&sheet, 10)[..3], &[5, 0, 2]);
}

#[test]
fn locale_folding_uses_the_shared_turkic_and_final_sigma_rules() {
    for locale in ["tr", "az-Latn-AZ"] {
        let list = list(&["I", "İ", "ΟΣ"], locale);
        assert_eq!(list.rank("ı", false), Some(0));
        assert_eq!(list.rank("I\u{0307}", false), Some(1));
        assert_eq!(list.rank("ος", false), Some(2));
        assert_eq!(list.rank("ı", true), None);
    }
    assert_eq!(CustomList::new(&["I".into(), "ı".into()], "tr"),
        Err(CustomListError::DuplicateEntry));
    assert!(CustomList::new(&["I".into(), "ı".into()], "en").is_ok());
}

#[test]
fn shared_value_budgets_accept_512_and_count_utf16_without_separators() {
    let mut entries = (0..512).map(|i| format!("item-{i}")).collect::<Vec<_>>();
    assert!(CustomList::new(&entries, "en-Latn-US").is_ok());
    entries.push("extra".into());
    assert_eq!(CustomList::new(&entries, "en"), Err(CustomListError::TooLong));
    let exact = vec!["😀".repeat(8191), "xy".into()];
    assert!(CustomList::new(&exact, "en").is_ok());
    assert_eq!(CustomList::new(&[exact[0].clone(), "xyz".into()], "en"),
        Err(CustomListError::TooManyUnits));
    for values in [vec![], vec!["one".into()]] {
        assert_eq!(CustomList::new(&values, "en"), Err(CustomListError::TooShort));
    }
    assert_eq!(CustomList::new(&["a".into(), " \t".into()], "en"),
        Err(CustomListError::EmptyEntry));
    assert_eq!(CustomList::new(&["a".into(), "A".into()], "en"),
        Err(CustomListError::DuplicateEntry));
    for locale in ["EN", "en-us", "de", "tr-u-co-search", "en-US-x-test"] {
        assert_eq!(CustomList::new(&["a".into(), "b".into()], locale),
            Err(CustomListError::UnsupportedLocale));
    }
}
