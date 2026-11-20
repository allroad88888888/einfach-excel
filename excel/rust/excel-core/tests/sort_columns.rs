use einfach_core::Value;
use einfach_excel_core::sort::{RowSortCriterion, SortColorPosition, SortColorSource, SortDirection,
    SortRangeError};
use einfach_excel_core::workbook::SheetVisibility;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, ColumnFilterRule,
    ConditionalFormatRuleEntry, IconSet, Workbook};
use serde_json::json;

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

fn write_records(book: &mut Workbook, sheet: usize) {
    for (column, score, record) in [('A', 3., "alpha"), ('B', 99., "hidden"),
        ('C', 2., "first tie"), ('D', 1., "low"), ('E', 2., "second tie")] {
        book.set_cell(sheet, &format!("{column}1"), Value::Number(score));
        book.set_cell(sheet, &format!("{column}2"), Value::Text(record.into()));
    }
}

fn records(book: &Workbook, sheet: &str, expected: &[&str]) {
    let actual: Vec<_> = (b'A'..=b'E').map(|column|
        book.get_cell(sheet, &format!("{}2", char::from(column)))).collect();
    assert_eq!(actual,
        expected.iter().map(|record| Value::Text((*record).into())).collect::<Vec<_>>());
}

#[test]
fn hidden_columns_keep_their_slots_while_equal_visible_columns_are_stable() {
    let mut book = Workbook::new();
    let sheet = book.add_sheet("Horizontal");
    write_records(&mut book, sheet);
    book.set_formula(sheet, "D1", "=3-2");
    book.set_cell(sheet, "D4", Value::Text("Outside".into()));
    book.sheet_mut(sheet).unwrap().set_format("D2", CellFormat {
        background: Some("#c00000".into()), ..CellFormat::default()
    });
    let visibility = SheetVisibility { rows: vec![1], columns: vec![1] };
    book.restore_sheet_visibility(sheet, &visibility).unwrap();
    let key = RowSortCriterion::value(0, SortDirection::Ascending, false, false, None);
    let report = book.sort_columns_by_criteria(sheet, range("A1", "E2"), &[key]).unwrap();
    assert_eq!(report.moved_columns, 3);
    assert_eq!(report.column_permutation, [(0, 3), (3, 4), (4, 0)]);
    records(&book, "Horizontal", &["low", "hidden", "first tie", "second tie", "alpha"]);
    assert_eq!(book.sheet_visibility(sheet).unwrap().columns, [1]);
    assert_eq!(book.get_cell("Horizontal", "D4"), Value::Text("Outside".into()));
    let target = book.sheet(sheet).unwrap();
    assert_eq!(target.get_formula("A1").as_deref(), Some("=3-2"));
    assert_eq!(target.get_format("A2").background.as_deref(), Some("#c00000"));
}

#[test]
fn row_keys_read_displayed_icon_and_fill_facts_in_one_column_permutation() {
    let mut book = Workbook::new();
    let sheet = book.add_sheet("Horizontal");
    write_records(&mut book, sheet);
    book.set_conditional_format_rule(sheet, 0, ConditionalFormatRuleEntry {
        id: "icons".into(), row_start: 0, row_end: 0, col_start: 0, col_end: 4, priority: 0,
        additional_ranges: Vec::new(), rule_json: json!({
            "kind":"icon-set","iconSet":"three-arrows","reverse":true,"showValue":false,
            "lowerThreshold":{"type":"number","value":"2"},
            "upperThreshold":{"type":"number","value":"50"},
        }).to_string(),
    }).unwrap();
    let active = book.sheet_mut(sheet).unwrap();
    active.set_format("E2", CellFormat {
        background: Some("#ff0000".into()), ..CellFormat::default()
    });
    let icon = RowSortCriterion::icon(0, Some((IconSet::Arrows, 2)), SortColorPosition::Bottom).unwrap();
    let color = RowSortCriterion::color(1, SortColorSource::Fill, Some("#ff0000"), SortColorPosition::Top).unwrap();
    book.sort_columns_by_criteria(sheet, range("A1", "E2"), &[icon, color]).unwrap();
    records(&book, "Horizontal", &["second tie", "alpha", "hidden", "first tie", "low"]);
}

#[test]
fn active_filters_and_partial_table_intersections_reject_without_relocation() {
    let mut book = Workbook::new();
    let sheet = book.add_sheet("Horizontal");
    write_records(&mut book, sheet);
    let key = RowSortCriterion::value(0, SortDirection::Ascending, false, false, None);
    let bounds = range("A1", "E2");
    book.apply_filter_range(sheet, bounds, &[ColumnFilterRule::Equals {
        col_index: 1, value: "hidden".into(), case_sensitive: false,
    }]).unwrap();
    assert_eq!(book.sort_columns_by_criteria(sheet, bounds, std::slice::from_ref(&key)),
        Err(SortRangeError::FilterIntersectsRange));
    book.clear_filter(sheet).unwrap();
    book.set_cell(sheet, "E3", Value::Text("Score".into()));
    book.set_cell(sheet, "F3", Value::Text("Value".into()));
    book.define_table(Some("Orders"), sheet, range("E3", "F4"), true).unwrap();
    assert_eq!(book.sort_columns_by_criteria(sheet, range("A1", "E4"), &[key]),
        Err(SortRangeError::TableIntersectsRange));
    records(&book, "Horizontal", &["alpha", "hidden", "first tie", "low", "second tie"]);
}

#[test]
fn horizontal_sort_checks_protection_and_dimensions_before_layout_scans() {
    let mut book = Workbook::new();
    let sheet = book.add_sheet("Horizontal");
    write_records(&mut book, sheet);
    let key = RowSortCriterion::value(0, SortDirection::Ascending, false, false, None);
    book.merge_cells(sheet, range("A1", "A2"), einfach_excel_core::MergeAction::Merge, true)
        .unwrap();
    // 1-column range returns InvalidRange before hitting merge validation.
    assert_eq!(
        book.sort_columns_by_criteria(sheet, range("A1", "A2"), std::slice::from_ref(&key)),
        Err(SortRangeError::InvalidRange)
    );
    book.restore_protection(vec![(
        sheet,
        einfach_excel_core::protection::SheetProtection {
            mode: einfach_excel_core::protection::ProtectionMode::Protected,
            unlocked_ranges: Vec::new(),
            ..Default::default()
        },
    )])
    .unwrap();
    assert_eq!(
        book.sort_columns_by_criteria(sheet, range("A1", "E2"), &[key]),
        Err(SortRangeError::ProtectedRange)
    );
}
