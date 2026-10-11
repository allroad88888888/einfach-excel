//! 名称改名必须覆盖已经保存的公式消费者，而不仅是单元格文本。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook::NamedRangeAction;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn seed() -> Workbook {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(10.0));
    book.set_cell(0, "A2", Value::Number(20.0));
    book.define_named_range("Sales", 0, range("A1", "A2"))
        .unwrap();
    book
}
fn rename(book: &mut Workbook, history: &mut WorkbookHistory) {
    history
        .change_named_range(
            book,
            0,
            NamedRangeAction::Update {
                name: "Sales".into(),
                new_name: "Total".into(),
                target: None,
            },
        )
        .unwrap();
}
fn install(book: &mut Workbook, sheet: usize, id: &str, formula: &str) {
    let mut entry = rule(id, range("B1", "B2"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
        "format":{"bold":true}})
    .to_string();
    let revision = book.conditional_format_config(sheet).unwrap().revision;
    book.set_conditional_format_rule(sheet, revision, entry)
        .unwrap();
}
fn bold(book: &Workbook, sheet: usize) -> bool {
    book.snapshot_display_format_range(sheet, range("B1", "B1"))
        .unwrap()
        .formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}

#[test]
fn conditional_formula_rename_preserves_display_and_exact_undo_sources() {
    let mut book = seed();
    let other = book.add_sheet("Other");
    install(
        &mut book,
        other,
        "named",
        "= LET(Total,7,SUM(Sales)+Total) > 35",
    );
    let original = book.conditional_format_config(other).unwrap().rules;
    let mut history = WorkbookHistory::default();
    assert!(bold(&book, other));
    rename(&mut book, &mut history);
    assert!(bold(&book, other));
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    // 外部增加的不相关规则不能被名称 undo 抹掉。
    install(&mut book, other, "unrelated", "=FALSE");
    for _ in 0..3 {
        history.undo(&mut book).unwrap();
        let rules = book.conditional_format_config(other).unwrap().rules;
        assert_eq!(rules[0], original[0]);
        assert_eq!(rules[1].id, "unrelated");
        assert!(bold(&book, other));
        history.redo(&mut book).unwrap();
        assert!(bold(&book, other));
    }
}

#[test]
fn externally_changed_conditional_formula_rejects_undo_before_changing_name() {
    let mut book = seed();
    install(&mut book, 0, "named", "=SUM(Sales)>0");
    let mut history = WorkbookHistory::default();
    rename(&mut book, &mut history);
    install(&mut book, 0, "named", "=FALSE");
    assert!(history.undo(&mut book).is_err());
    assert!(book.named_range("Total").unwrap().is_some());
    assert!(!bold(&book, 0));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn stored_lambda_rename_avoids_capture_and_keeps_nested_closures_live() {
    let mut book = seed();
    for (name, formula) in [
        ("WithParam", "=LAMBDA(Total,SUM(Sales)+Total)"),
        ("Captured", "=LET(Total,7,LAMBDA(x,SUM(Sales)+Total+x))"),
        ("Nested", "=LET(fn,LAMBDA(SUM(Sales)),LAMBDA(fn()))"),
        ("Shadowed", "=LAMBDA(Sales,Sales+1)"),
    ] {
        book.define_name(name, formula).unwrap();
    }
    let shadowed = book.get_named("Shadowed").unwrap();
    for (address, formula) in [
        ("C1", "=WithParam(7)"),
        ("C2", "=Captured(0)"),
        ("C3", "=Nested()"),
        ("C4", "=Shadowed(6)"),
    ] {
        assert!(book.set_formula(0, address, formula));
    }
    let check = |book: &Workbook| {
        for (address, expected) in [("C1", 37.0), ("C2", 37.0), ("C3", 30.0), ("C4", 7.0)] {
            assert_eq!(
                book.get_cell("Sheet1", address),
                Value::Number(expected),
                "{address}"
            );
        }
    };
    check(&book);
    let mut history = WorkbookHistory::default();
    rename(&mut book, &mut history);
    check(&book);
    assert_eq!(book.get_named("Shadowed"), Some(shadowed));
    for _ in 0..3 {
        history.undo(&mut book).unwrap();
        check(&book);
        history.redo(&mut book).unwrap();
        check(&book);
    }
    book.set_cell(0, "A2", Value::Number(40.0));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(57.0));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(57.0));
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(50.0));
}

#[test]
fn external_lambda_change_rejects_undo_without_touching_workbook_facts() {
    let mut book = seed();
    book.define_name("Compute", "=LAMBDA(SUM(Sales))").unwrap();
    let mut history = WorkbookHistory::default();
    rename(&mut book, &mut history);
    book.define_name("Compute", "=LAMBDA(99)").unwrap();
    assert!(history.undo(&mut book).is_err());
    assert!(book.named_range("Total").unwrap().is_some());
    assert!(book.set_formula(0, "C1", "=Compute()"));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(99.0));
}

#[test]
fn renamed_globals_do_not_capture_the_callers_unrelated_let_frame() {
    let mut book = seed();
    book.define_name("Compute", "=LAMBDA(SUM(Sales))").unwrap();
    book.define_name("Nested", "=LET(Total,LAMBDA(SUM(Sales)),LAMBDA(Total()))").unwrap();
    book.set_formula(0, "C1", "=LET(Total,99,Compute())");
    book.set_formula(0, "C2", "=Nested()");
    for address in ["C1", "C2"] {
        assert_eq!(book.get_cell("Sheet1", address), Value::Number(30.0));
    }
    let mut history = WorkbookHistory::default();
    rename(&mut book, &mut history);
    for address in ["C1", "C2"] {
        assert_eq!(book.get_cell("Sheet1", address), Value::Number(30.0), "{address}");
    }
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(30.0));
}
