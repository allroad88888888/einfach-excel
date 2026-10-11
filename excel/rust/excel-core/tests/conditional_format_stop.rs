//! Stop 必须拦截所有低优先级规则，但不能清除基础样式或已经命中的高级规则。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use serde_json::json;
use support::{range, rule};

#[test]
fn formula_rank_and_duplicate_highlights_can_stop_without_erasing_base_formats() {
    use einfach_excel_core::cell_style::{CellStyle, StyleScope};
    for high in [
        json!({"kind":"formula", "formula":"=A1>0", "stopIfTrue":true, "format":{"bold":true}}),
        json!({"kind":"top-bottom", "direction":"top", "count":1, "stopIfTrue":true, "format":{"bold":true}}),
        json!({"kind":"duplicate-values", "mode":"duplicate", "stopIfTrue":true, "format":{"bold":true}}),
    ] {
        let mut book = Workbook::new();
        book.set_cell(0, "A1", Value::Number(2.0));
        book.set_cell(0, "A2", Value::Number(2.0));
        book.sheet_mut(0).unwrap().patch_format_range(range("A1", "A2"), StyleScope::Cell,
            CellStyle { underline: Some(true), ..Default::default() });
        for (index, json) in [high, json!({"kind":"cell-value","operator":"gt","value":"0",
            "format":{"italic":true}})].into_iter().enumerate() {
            let mut entry = rule(&format!("r{index}"), range("A1", "A2"), "gt", "0");
            entry.priority = index as i64;
            entry.rule_json = json.to_string();
            book.set_conditional_format_rule(0, index as u64, entry).unwrap();
        }
        let display = book.snapshot_display_format_range(0, range("A1", "A2")).unwrap();
        for (_, style) in display.formats.cell_styles {
            assert_eq!((style.bold, style.italic, style.underline), (Some(true), None, Some(true)));
        }
    }
}

#[test]
fn stop_suppresses_lower_properties_scales_and_bars_only_on_matching_cells() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(8.0));
    book.set_cell(0, "A2", Value::Number(2.0));
    let rules = [
        json!({"kind":"cell-value","operator":"gt","value":"0","format":{"underline":true}}),
        json!({"kind":"cell-value","operator":"gt","value":"5","stopIfTrue":true,"format":{"bold":true}}),
        json!({"kind":"cell-value","operator":"gt","value":"0","format":{"italic":true}}),
        json!({"kind":"color-scale","minColor":"#000000","maxColor":"#ffffff"}),
        json!({"kind":"data-bar"}),
    ];
    let mut history = WorkbookHistory::default();
    for (index, json) in rules.into_iter().enumerate() {
        let mut entry = rule(&format!("r{index}"), range("A1", "A2"), "gt", "0");
        entry.priority = index as i64;
        entry.rule_json = json.to_string();
        history
            .set_conditional_format_rule(&mut book, 0, index as u64, entry)
            .unwrap();
    }
    let display = book
        .snapshot_display_format_range(0, range("A1", "A2"))
        .unwrap();
    let a1 = &display.formats.cell_styles[0].1;
    assert_eq!(
        (a1.underline, a1.bold, a1.italic, &a1.background),
        (Some(true), Some(true), None, &None)
    );
    let a2 = &display.formats.cell_styles[1].1;
    assert_eq!(
        (a2.underline, a2.bold, a2.italic),
        (Some(true), None, Some(true))
    );
    assert_eq!(display.data_bars.len(), 1);
    assert_eq!(display.data_bars[0].0.row, 1);
    let mut stop = book.conditional_format_config(0).unwrap().rules[1].clone();
    stop.rule_json = stop
        .rule_json
        .replace("\"stopIfTrue\":true", "\"stopIfTrue\":false");
    history
        .set_conditional_format_rule(&mut book, 0, 5, stop)
        .unwrap();
    assert_eq!(
        book.snapshot_display_format_range(0, range("A1", "A2"))
            .unwrap()
            .data_bars
            .len(),
        2
    );
    history.undo(&mut book).unwrap();
    assert_eq!(
        book.snapshot_display_format_range(0, range("A1", "A2"))
            .unwrap(),
        display
    );
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.snapshot_display_format_range(0, range("A1", "A2"))
            .unwrap()
            .data_bars
            .len(),
        2
    );
    assert!(book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "A2"))
        .cell_styles
        .is_empty());
}

#[test]
fn text_stop_and_disabled_rules_keep_stable_equal_priority_order() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Ready".into()));
    for (index, enabled) in [false, true, true].into_iter().enumerate() {
        let mut entry = rule(&format!("r{index}"), range("A1", "A1"), "gt", "0");
        entry.rule_json = json!({"kind":"text", "condition":"contains", "text":"ready",
            "enabled":enabled, "stopIfTrue":true,
            "format":{"bgColor":if index == 1 {"#00ff00"} else {"#ff0000"}}})
        .to_string();
        book.set_conditional_format_rule(0, index as u64, entry)
            .unwrap();
    }
    let display = book
        .snapshot_display_format_range(0, range("A1", "A1"))
        .unwrap();
    assert_eq!(
        display.formats.cell_styles[0].1.background,
        Some(Some("#00ff00".into()))
    );
}
