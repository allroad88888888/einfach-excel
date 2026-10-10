//! 行列结构操作必须同步恢复条件公式，含其它工作表上的条件规则。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn install(book: &mut Workbook, sheet: usize, formula: &str) {
    let mut entry = rule("formula", range("B2", "B4"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
        "format":{"bold":true}})
    .to_string();
    book.set_conditional_format_rule(sheet, 0, entry).unwrap();
}

fn formula(book: &Workbook, sheet: usize) -> String {
    let config = book.conditional_format_config(sheet).unwrap();
    let json: serde_json::Value = serde_json::from_str(&config.rules[0].rule_json).unwrap();
    json["formula"].as_str().unwrap().to_string()
}

#[test]
fn insertion_rewrites_local_and_explicit_cross_sheet_references_then_undo_restores_both() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A2", Value::Number(7.0));
    install(&mut book, 0, "=$A2>5");
    install(&mut book, 1, "=Sheet1!$A2>5");
    let before = book.snapshot_conditional_formats();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    assert!(formula(&book, 0).contains("$A3"));
    assert!(formula(&book, 1).contains("$A3"));
    assert_eq!(
        book.conditional_format_config(0).unwrap().rules[0].row_start,
        2
    );
    assert_eq!(
        book.conditional_format_config(1).unwrap().rules[0].row_start,
        1
    );
    let after = book.snapshot_conditional_formats();
    history.undo(&mut book).unwrap();
    for sheet in 0..2 {
        assert_eq!(
            book.conditional_format_config(sheet).unwrap().rules,
            before[sheet].rules
        );
    }
    history.redo(&mut book).unwrap();
    for sheet in 0..2 {
        assert_eq!(
            book.conditional_format_config(sheet).unwrap().rules,
            after[sheet].rules
        );
    }
}

#[test]
fn deleting_the_rule_origin_rebases_to_the_first_surviving_cell() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Number(1.0));
    book.set_cell(0, "A3", Value::Number(9.0));
    install(&mut book, 0, "=$A2>5");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    assert!(!formula(&book, 0).contains("#REF!"));
    assert!(book
        .snapshot_display_format_range(0, range("B2", "B2"))
        .unwrap()
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true)));
    history.undo(&mut book).unwrap();
    assert_eq!(formula(&book, 0), "=$A2>5");
}

#[test]
fn deleting_an_absolute_reference_leaves_ref_error_which_iferror_can_handle() {
    let mut book = Workbook::new();
    install(&mut book, 0, "=IFERROR($A$1>5,TRUE)");
    book.try_structural_edit(0, ShiftEdit::RowDelete { at: 0, count: 1 })
        .unwrap();
    assert!(formula(&book, 0).contains("#REF!"));
    assert!(book
        .snapshot_display_format_range(0, range("B1", "B1"))
        .unwrap()
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true)));
}

#[test]
fn exhausted_cross_sheet_rule_revision_rejects_structure_before_any_cell_moves() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A1", Value::Number(5.0));
    install(&mut book, 1, "=Sheet1!A1>0");
    let mut configs = book.snapshot_conditional_formats();
    configs[0].revision = u64::MAX;
    book.restore_conditional_formats(configs.clone()).unwrap();
    assert!(book
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(5.0));
    assert_eq!(book.snapshot_conditional_formats(), configs);
}
