//! 表头局部插行的单矩形条件规则，仍共用原有规则 ID、统计 atom 与历史。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook::{ConditionalFormatRuleEntry, TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellStyle, Workbook};
use support::{range, rule};

fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("A3", "C4"), false, false,
        vec!["Qty".into(), "Amount".into(), "Tax".into()],
    )])).unwrap();
    book.set_cell(0, "A2", Value::Text("Keep outside".into()));
    book.set_cell(0, "A5", Value::Number(0.));
    book.set_cell(0, "A6", Value::Number(50.));
    book.set_cell(0, "A1000", Value::Number(100.));
    book.add_sheet("Report");
    (book, WorkbookHistory::default())
}
fn install(book: &mut Workbook, sheet: usize, id: &str, first: &str, last: &str, json: serde_json::Value) {
    let mut entry = rule(id, range(first, last), "gt", "0");
    entry.rule_json = json.to_string();
    let revision = book.conditional_format_config(sheet).unwrap().revision;
    book.set_conditional_format_rule(sheet, revision, entry).unwrap();
}
fn formula(book: &mut Workbook, sheet: usize, id: &str, first: &str, last: &str, text: &str) {
    install(book, sheet, id, first, last, serde_json::json!({"kind":"formula", "formula":text,
        "format":{"bold":true}}));
}
fn entries(book: &Workbook, sheet: usize) -> Vec<ConditionalFormatRuleEntry> {
    book.conditional_format_config(sheet).unwrap().rules
}
fn style(book: &Workbook, sheet: usize, address: &str) -> CellStyle {
    book.snapshot_display_format_range(sheet, range(address, address)).unwrap()
        .formats.cell_styles.into_iter().next().map(|(_, style)| style).unwrap_or_default()
}

#[test]
fn local_and_cross_sheet_formula_consumers_follow_the_band_in_one_rule_history() {
    let (mut book, mut history) = seed();
    formula(&mut book, 0, "local", "B5", "B1000", "=$A5>5");
    formula(&mut book, 1, "remote", "B5", "B1000", "=Sheet1!$A5>5");
    // 列带以外的作用范围不动，但引用仍应更新；绝对引用也跟结构走。
    formula(&mut book, 0, "outside", "E1", "E1", "=$A$6>5");
    let before = [entries(&book, 0), entries(&book, 1)];
    assert_eq!(style(&book, 0, "B6").bold, Some(true));
    assert_eq!(style(&book, 1, "B6").bold, Some(true));
    history.set_table_headers(&mut book, "Orders", true, 2000).unwrap();
    let after = [entries(&book, 0), entries(&book, 1)];
    assert_eq!((after[0][0].row_start, after[0][0].row_end), (5, 1000));
    assert_eq!((after[1][0].row_start, after[1][0].row_end), (4, 999));
    assert!(after[0][0].rule_json.contains("$A6"));
    assert!(after[1][0].rule_json.contains("$A6"));
    assert!(after[0][1].rule_json.contains("$A$7"));
    for _ in 0..2 {
        assert_ne!(style(&book, 0, "B6").bold, Some(true));
        assert_eq!(style(&book, 0, "B7").bold, Some(true));
        assert_eq!(style(&book, 1, "B6").bold, Some(true));
        assert_eq!(style(&book, 0, "E1").bold, Some(true));
        history.undo(&mut book).unwrap();
        assert_eq!([entries(&book, 0), entries(&book, 1)], before);
        assert_eq!(style(&book, 0, "B6").bold, Some(true));
        history.redo(&mut book).unwrap();
        assert_eq!([entries(&book, 0), entries(&book, 1)], after);
    }
    book.set_cell(0, "A7", Value::Number(1.));
    assert_ne!(style(&book, 0, "B7").bold, Some(true));
    assert_ne!(style(&book, 1, "B6").bold, Some(true));
    assert_ne!(style(&book, 0, "E1").bold, Some(true));
}

#[test]
fn scale_rank_and_bars_keep_their_offscreen_statistics_and_invalidate_the_old_cache() {
    let (mut book, mut history) = seed();
    install(&mut book, 0, "scale", "A5", "A1000", serde_json::json!({
        "kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"}));
    install(&mut book, 0, "rank", "A5", "A1000", serde_json::json!({
        "kind":"top-bottom", "direction":"top", "count":1, "format":{"bold":true}}));
    install(&mut book, 0, "bar", "A5", "A1000", serde_json::json!({"kind":"data-bar"}));
    let before = entries(&book, 0);
    let formats = style(&book, 0, "A6");
    let bar = book.snapshot_display_format_range(0, range("A6", "A6")).unwrap().data_bars[0].1.clone();
    assert_eq!(formats.background, Some(Some("#808080".into())));
    assert_ne!(formats.bold, Some(true));
    assert_eq!(style(&book, 0, "A1000").bold, Some(true));
    history.set_table_headers(&mut book, "Orders", true, 2000).unwrap();
    for _ in 0..2 {
        let rules = entries(&book, 0);
        assert_eq!(rules.len(), 3);
        for (old, new) in before.iter().zip(&rules) {
            assert_eq!((&new.id, new.priority, &new.rule_json), (&old.id, old.priority, &old.rule_json));
        }
        assert_eq!(style(&book, 0, "A7"), formats);
        assert_eq!(style(&book, 0, "A1001").bold, Some(true));
        assert_eq!(book.snapshot_display_format_range(0, range("A7", "A7")).unwrap().data_bars[0].1, bar);
        history.undo(&mut book).unwrap();
        assert_eq!(entries(&book, 0), before);
        assert_eq!(style(&book, 0, "A6"), formats);
        history.redo(&mut book).unwrap();
    }
    book.set_cell(0, "A1001", Value::Number(200.));
    assert_eq!(style(&book, 0, "A7").background, Some(Some("#404040".into())));
    book.set_cell(0, "A7", Value::Number(300.));
    assert_eq!(style(&book, 0, "A7").bold, Some(true));
    assert_ne!(style(&book, 0, "A1001").bold, Some(true));
}

#[test]
fn crossing_rows_extend_whole_columns_stay_fixed_and_opaque_rules_keep_their_payload() {
    let (mut book, mut history) = seed();
    let unknown = serde_json::json!({"kind":"future-rule", "options":[1,2,3]});
    install(&mut book, 0, "opaque", "A1", "A1000", unknown.clone());
    install(&mut book, 0, "columns", "A1", "F1048576", unknown.clone());
    install(&mut book, 0, "above", "A1", "F1", unknown.clone());
    install(&mut book, 0, "adjacent", "F5", "F6", unknown);
    let before = entries(&book, 0);
    history.set_table_headers(&mut book, "Orders", true, 2000).unwrap();
    let after = entries(&book, 0);
    assert_eq!((after[0].row_start, after[0].row_end), (0, 1000));
    assert_eq!(after[0].rule_json, before[0].rule_json);
    assert_eq!(&after[1..], &before[1..]);
    history.undo(&mut book).unwrap();
    assert_eq!(entries(&book, 0), before);
}

#[test]
fn unchanged_whole_column_rule_keeps_its_atom_live_when_sparse_members_move() {
    let (mut book, mut history) = seed();
    install(&mut book, 0, "rank", "A1", "F1048576", serde_json::json!({
        "kind":"top-bottom", "direction":"top", "count":1, "format":{"italic":true}}));
    let before = book.snapshot_conditional_formats();
    assert_eq!(style(&book, 0, "A1000").italic, Some(true));
    history.set_table_headers(&mut book, "Orders", true, 2000).unwrap();
    assert_eq!(book.snapshot_conditional_formats(), before); // 不需要重建目录或 revision。
    assert_eq!(style(&book, 0, "A1001").italic, Some(true));
    history.undo(&mut book).unwrap();
    assert_eq!(style(&book, 0, "A1000").italic, Some(true));
    history.redo(&mut book).unwrap();
    book.set_cell(0, "A1001", Value::Number(1.));
    assert_eq!(style(&book, 0, "A7").italic, Some(true));
    assert_ne!(style(&book, 0, "A1001").italic, Some(true));
}

#[test]
fn unrelated_rule_edits_survive_history_but_changes_to_moved_rules_reject_it() {
    let (mut book, mut history) = seed();
    formula(&mut book, 0, "local", "B5", "B1000", "=$A5>5");
    history.set_table_headers(&mut book, "Orders", true, 2000).unwrap();
    formula(&mut book, 0, "other", "F1", "F1", "=TRUE");
    history.undo(&mut book).unwrap();
    assert!(entries(&book, 0).iter().any(|entry| entry.id == "other"));
    history.redo(&mut book).unwrap();
    formula(&mut book, 0, "local", "B6", "B1001", "=FALSE");
    let rules = book.snapshot_conditional_formats();
    let table = book.snapshot_tables();
    assert!(history.undo(&mut book).unwrap_err().contains("conditional formula changed"));
    assert_eq!(book.snapshot_conditional_formats(), rules);
    assert_eq!(book.snapshot_tables(), table);
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Qty".into()));
}

#[test]
fn canvas_overflow_and_revision_exhaustion_reject_without_losing_redo() {
    for case in ["overflow", "local-revision", "remote-revision"] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
        history.undo(&mut book).unwrap();
        let (sheet, first, last) = match case {
            "overflow" => (0, "A1999", "A2000"),
            "remote-revision" => (1, "B5", "B6"),
            _ => (0, "B5", "B6"),
        };
        formula(&mut book, sheet, "rule", first, last, "=Sheet1!A5>5");
        let mut rules = book.snapshot_conditional_formats();
        if case.ends_with("revision") {
            rules[0].revision = u64::MAX;
            book.restore_conditional_formats(rules.clone()).unwrap();
        }
        let tables = book.snapshot_tables();
        assert!(history.set_table_headers(&mut book, "Orders", true, 2000).is_err(), "{case}");
        assert_eq!(book.snapshot_conditional_formats(), rules);
        assert_eq!(book.snapshot_tables(), tables);
        assert_eq!(book.get_cell("Sheet1", "A6"), Value::Number(50.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
    }
}
