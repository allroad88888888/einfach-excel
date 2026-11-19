use einfach_core::Value;
use einfach_excel_core::sort::{SortColorPosition, SortCriterion, SortIconKey};
use einfach_excel_core::{CellAddress, CellRange, ConditionalFormatRuleEntry, IconSet, Workbook};
use serde_json::json;

const RECORDS: [&str; 5] = ["down", "missing", "middle", "up", "flag"];

fn fixture() -> (Workbook, usize, CellRange) {
    let mut book = Workbook::new();
    let sheet = book.add_sheet("Icons");
    for (i, label) in RECORDS.iter().enumerate() {
        book.set_cell(sheet, &format!("B{}", i + 1), Value::Text((*label).into()));
    }
    for (row, value) in [(1, 100.0), (3, 10.0), (4, 0.0), (5, 0.0)] {
        book.set_cell(sheet, &format!("A{row}"), Value::Number(value));
    }
    book.set_cell(sheet, "A2", Value::Text("text".into()));
    for (set, first, last) in [("three-arrows", 0, 3), ("three-flags", 4, 4)] {
        let revision = book.conditional_format_config(sheet).unwrap().revision;
        book.set_conditional_format_rule(sheet, revision, ConditionalFormatRuleEntry {
            id: set.into(), row_start: first, row_end: last, col_start: 0, col_end: 0,
            priority: 0, additional_ranges: Vec::new(),
            rule_json: json!({
                "kind":"icon-set","iconSet":set,"reverse":true,"showValue":false,
                "lowerThreshold":{"type":"number","value":"10"},
                "upperThreshold":{"type":"number","value":"50"},
            }).to_string(),
        }).unwrap();
    }
    (book, sheet, CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 1)))
}

fn records(book: &Workbook, expected: &[&str]) {
    let actual: Vec<_> = (1..=5).map(|row| book.get_cell("Icons", &format!("B{row}"))).collect();
    assert_eq!(actual, expected.iter().map(|v| Value::Text((*v).into())).collect::<Vec<_>>());
}

#[test]
fn reversed_icons_match_their_set_and_index_even_when_values_are_hidden() {
    let (mut book, sheet, range) = fixture();
    let display = book.snapshot_display_format_range(sheet, range).unwrap();
    let index_two: Vec<_> = display.conditional_icons.iter().filter(|(_, icon)| icon.index == 2)
        .map(|(_, icon)| (icon.set, icon.show_value)).collect();
    assert_eq!(index_two, vec![(IconSet::Arrows, false), (IconSet::Flags, false)]);
    let key = SortIconKey::new(0, Some((IconSet::Arrows, 2)), SortColorPosition::Top).unwrap();
    book.sort_range_by_criteria(sheet, range, &[SortCriterion::Icon(key)], &[]).unwrap();
    records(&book, &["up", "down", "missing", "middle", "flag"]);
}

#[test]
fn no_icon_is_not_the_same_as_index_zero() {
    let (mut book, sheet, range) = fixture();
    let key = SortIconKey::new(0, None, SortColorPosition::Bottom).unwrap();
    book.sort_range_by_criteria(sheet, range, &[SortCriterion::Icon(key)], &[]).unwrap();
    records(&book, &["down", "middle", "up", "flag", "missing"]);
    assert!(SortIconKey::new(0, Some((IconSet::Flags, 3)), SortColorPosition::Top).is_err());
}
