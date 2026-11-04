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
        .unwrap().formats
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
        .unwrap().formats
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

#[test]
fn undo_restores_only_rewritten_sources_on_a_referencing_sheet() {
    // 回归（#17）：撤销整段恢复引用表的单元格快照与规则目录，冲掉之后在那张表上的修改。
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A2", Value::Number(7.0));
    assert!(book.set_formula(1, "A1", "=Sheet1!A2"));
    install(&mut book, 1, "=Sheet1!$A2>5");
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    // 这些修改不在该结构历史里，撤销/重做不能把它们改回去。
    book.sheet_mut(1).unwrap().set_format("A1", einfach_excel_core::CellFormat { bold: true, ..Default::default() });
    let revision = book.conditional_format_config(1).unwrap().revision;
    book.set_conditional_format_rule(1, revision, rule("later", range("D1", "D2"), "gt", "1")).unwrap();
    let validation = einfach_excel_core::data_validation::DataValidationRule {
        kind: einfach_excel_core::data_validation::DataValidationKind::WholeNumber { min: 0.0, max: 9.0 },
        ignore_blank: true, operator: Default::default(), options: Default::default(),
    };
    book.sheet_mut(1).unwrap().set_data_validation(range("C1", "C1"), Some(validation)).unwrap();
    for undo in [true, false] {
        if undo { history.undo(&mut book).unwrap(); } else { history.redo(&mut book).unwrap(); }
        let row = if undo { "A2" } else { "A3" };
        assert_eq!(book.sheet(1).unwrap().get_formula("A1"), Some(format!("=Sheet1!{row}")));
        assert!(formula(&book, 1).contains(&format!("${row}")));
        assert!(book.sheet(1).unwrap().get_format("A1").bold);
        assert_eq!(book.conditional_format_config(1).unwrap().rules.len(), 2);
        assert!(book.sheet(1).unwrap().data_validation_at(einfach_excel_core::CellAddress::parse("C1").unwrap()).is_some());
    }
}
