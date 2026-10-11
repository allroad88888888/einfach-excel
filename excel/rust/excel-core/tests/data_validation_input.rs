//! 用户输入校验必须保留原值/格式/历史，底层导入与重算不能被约束阻断。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};
use std::cell::Cell;
use std::rc::Rc;

fn point(address: &str) -> CellRange {
    CellRange::single(CellAddress::parse(address).unwrap())
}

fn install(book: &mut Workbook, address: &str, kind: Kind) {
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(
            point(address),
            Some(Rule {
                kind,
                ignore_blank: true,
            }),
        )
        .unwrap();
}

#[test]
fn literals_and_automatic_formats_are_rejected_before_any_write() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "2").unwrap();
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    let format = book.sheet(0).unwrap().get_format("A1");
    for input in [
        "11",
        "2.5",
        "50%",
        "12:00",
        "2026-01-01",
        "0 1/2",
        "'2",
        "=20",
        "=1/0",
    ] {
        assert_eq!(
            book.set_cell_input(0, "A1", input),
            Err("DATA_VALIDATION_FAILED"),
            "{input}"
        );
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.0));
        assert_eq!(book.sheet(0).unwrap().get_format("A1"), format);
        assert!(book.sheet(0).unwrap().get_formula("A1").is_none());
    }
    book.set_cell_input(0, "A1", "100%").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
    assert_eq!(
        book.sheet(0).unwrap().get_format("A1").number_format,
        NumberFormat::Percent { digits: 0 }
    );
    book.set_cell_input(0, "A1", "").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
}

#[test]
fn text_format_is_not_coerced_and_lists_accept_typed_choices() {
    let mut book = Workbook::new();
    install(&mut book, "A1", Kind::Decimal { min: 0.0, max: 1.0 });
    book.set_cell_input(0, "A1", "0.5").unwrap();
    book.sheet_mut(0).unwrap().patch_format_range(
        point("A1"),
        StyleScope::Cell,
        CellStyle {
            number_format: Some(NumberFormat::Text),
            ..Default::default()
        },
    );
    assert_eq!(
        book.set_cell_input(0, "A1", "0.25"),
        Err("DATA_VALIDATION_FAILED")
    );
    install(
        &mut book,
        "B1",
        Kind::List {
            items: vec!["Paid".into(), "0.5".into()],
        },
    );
    book.set_cell_input(0, "B1", "paid").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("paid".into()));
    book.set_cell_input(0, "B1", "0.5").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(0.5));
    assert_eq!(
        book.set_cell_input(0, "B1", "Pending"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(0.5));
}

#[test]
fn rejected_formula_preserves_original_formula_dependents_and_sends_no_callbacks() {
    let mut book = Workbook::new();
    book.set_cell(0, "B1", Value::Number(2.0));
    book.set_formula(0, "A1", "=B1+1");
    let other = book.add_sheet("Other");
    book.set_formula(other, "A1", "=Sheet1!A1*2");
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    let calls = Rc::new(Cell::new(0));
    for sheet in [0, other] {
        let observed = calls.clone();
        book.sheet_mut(sheet)
            .unwrap()
            .subscribe_cell("A1", move || observed.set(observed.get() + 1));
    }
    calls.set(0);
    assert_eq!(
        book.set_cell_input(0, "A1", "=B1+20"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(
        book.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=B1+1")
    );
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(6.0));
    assert_eq!(calls.get(), 0);
    book.set_cell_input(0, "A1", "=B1+2").unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(8.0));
    assert_eq!(calls.get(), 2);
    // 重算不是新的用户输入；已有公式可以随依赖变化超出输入限制。
    book.set_cell_input(0, "B1", "100").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(102.0));
}

#[test]
fn rejected_formula_does_not_leave_spill_children_or_destroy_the_previous_spill() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    assert_eq!(
        book.set_cell_input(0, "A1", "=SEQUENCE(5,1,20)"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(
        book.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=SEQUENCE(3)")
    );
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Null);
    install(
        &mut book,
        "A2",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    assert_eq!(
        book.set_cell_input(0, "A2", "=20"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
}

#[test]
fn rejected_input_keeps_redo_and_raw_installation_bypasses_validation() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    history.begin(&book, 0, point("A1"), "Edit", true).unwrap();
    book.set_cell_input(0, "A1", "3").unwrap();
    history.finish(&mut book, true).unwrap();
    history.undo(&mut book).unwrap();
    history.begin(&book, 0, point("A1"), "Edit", true).unwrap();
    assert!(book.set_cell_input(0, "A1", "=99").is_err());
    history.finish(&mut book, false).unwrap();
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
    book.set_cell(0, "A1", Value::Number(99.0));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(99.0));
    book.set_formula(0, "A1", "=100");
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(100.0));
}

#[test]
fn rejected_input_preserves_imported_invalid_formula_source() {
    let mut book = Workbook::new();
    book.install_sheet_bulk(
        0,
        Default::default(),
        std::collections::HashMap::from([(CellAddress::new(0, 0), "=1+".to_string())]),
    )
    .unwrap();
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    assert_eq!(
        book.set_cell_input(0, "A1", "=99"),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(
        book.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=1+")
    );
}

#[test]
fn rejected_formula_with_outer_history_does_not_publish_a_rollback_value() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=3");
    install(
        &mut book,
        "A1",
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
    );
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    book.sheet_mut(0)
        .unwrap()
        .subscribe_cell("A1", move || observed.set(observed.get() + 1));
    let mut history = WorkbookHistory::default();
    history.begin(&book, 0, point("A1"), "Edit", true).unwrap();
    calls.set(0);
    assert!(book.set_cell_input(0, "A1", "=99").is_err());
    history.finish(&mut book, false).unwrap();
    assert_eq!(calls.get(), 0);
}
