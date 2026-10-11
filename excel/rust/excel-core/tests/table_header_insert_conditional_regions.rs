//! 局部腾位后仍是一条规则；三块区域共用统计，不把中间空洞纳入规则。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellStyle, Workbook};
use support::{range, rule};

fn style(book: &Workbook, address: &str) -> CellStyle {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .into_iter().next().map(|(_, style)| style).unwrap_or_default()
}

#[test]
fn partial_column_insertion_splits_scope_not_rules_and_preserves_statistics_and_history() {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("B3", "C4"), false, false, vec!["Qty".into(), "Tax".into()],
    )])).unwrap();
    book.set_cell(0, "B2", Value::Text("Occupied".into()));
    for (address, value) in [("A5", 0.), ("B5", 50.), ("C5", 100.), ("D5", 1000.), ("A7", -999.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    for (index, json) in [
        serde_json::json!({"kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"}),
        serde_json::json!({"kind":"top-bottom", "direction":"top", "count":1, "format":{"bold":true}}),
        serde_json::json!({"kind":"data-bar"}),
    ].into_iter().enumerate() {
        let mut entry = rule(&format!("rule-{index}"), range("A5", "D6"), "gt", "0");
        entry.rule_json = json.to_string();
        book.set_conditional_format_rule(0, index as u64, entry).unwrap();
    }
    let before = book.conditional_format_config(0).unwrap().rules;
    let original = style(&book, "B5");
    assert_eq!(original.background, Some(Some("#0d0d0d".into())));
    let original_bar = book.snapshot_display_format_range(0, range("B5", "B5")).unwrap().data_bars[0].1.clone();
    let mut history = WorkbookHistory::default();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        let after = book.conditional_format_config(0).unwrap().rules;
        assert_eq!(after.len(), 3);
        for (old, new) in before.iter().zip(&after) {
            assert_eq!((&new.id, new.priority, &new.rule_json), (&old.id, old.priority, &old.rule_json));
            assert_eq!(new.ranges().collect::<Vec<_>>(), vec![range("A5", "A6"), range("B6", "C7"), range("D5", "D6")]);
        }
        assert_eq!(style(&book, "B6"), original);
        assert_eq!(book.snapshot_display_format_range(0, range("B6", "B6")).unwrap().data_bars[0].1, original_bar);
        assert_eq!(style(&book, "A7").background, None);
        assert_ne!(style(&book, "C6").bold, Some(true));
        assert_eq!(style(&book, "D5").bold, Some(true));
        history.undo(&mut book).unwrap();
        assert_eq!(book.conditional_format_config(0).unwrap().rules, before);
        assert_eq!(style(&book, "B5"), original);
        history.redo(&mut book).unwrap();
    }
    book.set_cell(0, "D5", Value::Number(100.));
    assert_eq!(style(&book, "B6").background, Some(Some("#808080".into())));
    assert_eq!(style(&book, "C6").bold, Some(true));
}

#[test]
fn subsequent_insertion_moves_existing_extra_regions_and_capacity_failure_is_atomic() {
    use einfach_excel_core::{CellAddress, CellRange};
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("B1", "C2"), false, false, vec!["Qty".into(), "Tax".into()],
    )])).unwrap();
    book.set_conditional_format_rule(0, 0, rule("r", range("A5", "D6"), "gt", "0")).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_table_headers(&mut book, "Orders", true, 5000).unwrap();
    history.set_table_headers(&mut book, "Orders", false, 5000).unwrap();
    book.set_cell(0, "B1", Value::Text("Occupied".into()));
    history.set_table_headers(&mut book, "Orders", true, 5000).unwrap();
    let rules = book.conditional_format_config(0).unwrap().rules;
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].ranges().collect::<Vec<_>>(),
        vec![range("A5", "A6"), range("B7", "C8"), range("D5", "D6")]);
    history.undo(&mut book).unwrap();
    let mut too_many = rule("r", range("A5", "D6"), "gt", "0");
    too_many.additional_ranges = (0..4095).map(|row|
        CellRange::single(CellAddress::new(row, 5))).collect();
    let revision = book.conditional_format_config(0).unwrap().revision;
    book.set_conditional_format_rule(0, revision, too_many).unwrap();
    let before = book.snapshot_conditional_formats();
    let tables = book.snapshot_tables();
    let redo = history.redo_count();
    assert!(history.set_table_headers(&mut book, "Orders", true, 5000)
        .unwrap_err().contains("region limit"));
    assert_eq!(book.snapshot_conditional_formats(), before);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(history.redo_count(), redo);
}
