//! 比较条件只判断原生值；关系运算不能绕过类型域或破坏拒绝原子性。
use einfach_core::Value;
use einfach_excel_core::data_validation::{
    DataValidationKind as Kind, DataValidationOperator as Op, DataValidationRule as Rule,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn rule(kind: Kind, operator: Op) -> Rule {
    Rule {
        kind,
        operator,
        ignore_blank: false,
    }
}

#[test]
fn every_operator_has_exact_inclusive_and_exclusive_edges() {
    for (operator, expected) in [
        (Op::Between, [false, true, true, true, false]),
        (Op::NotBetween, [true, false, false, false, true]),
        (Op::Equal, [false, true, false, false, false]),
        (Op::NotEqual, [true, false, true, true, true]),
        (Op::GreaterThan, [false, false, true, true, true]),
        (Op::GreaterThanOrEqual, [false, true, true, true, true]),
        (Op::LessThan, [true, false, false, false, false]),
        (Op::LessThanOrEqual, [true, true, false, false, false]),
    ] {
        let rule = rule(Kind::Decimal { min: 2.0, max: 4.0 }, operator);
        rule.validate_definition().unwrap();
        let actual = [1.0, 2.0, 3.0, 4.0, 5.0].map(|n| rule.accepts(&Value::Number(n)));
        assert_eq!(actual, expected, "{operator:?}");
        for value in [
            Value::Number(f64::NAN),
            Value::Number(f64::INFINITY),
            Value::Text("3".into()),
            Value::Boolean(true),
        ] {
            assert!(!rule.accepts(&value));
        }
    }
}

#[test]
fn comparison_does_not_remove_integer_date_or_clock_restrictions() {
    assert!(
        !rule(Kind::WholeNumber { min: 2.0, max: 4.0 }, Op::NotBetween)
            .accepts(&Value::Number(4.5))
    );
    let date = rule(
        Kind::Date {
            min: "2026-01-01".into(),
            max: "2026-12-31".into(),
        },
        Op::NotBetween,
    );
    for n in [-1.0, 2_958_466.0, f64::INFINITY] {
        assert!(!date.accepts(&Value::Number(n)));
    }
    assert!(date.accepts(&Value::Number(60.0)));
    let time = rule(
        Kind::Time {
            min: "09:00".into(),
            max: "17:00".into(),
        },
        Op::NotBetween,
    );
    for n in [-0.5, 1.0, 1.5] {
        assert!(!time.accepts(&Value::Number(n)));
    }
    for n in [0.0, 0.75] {
        assert!(time.accepts(&Value::Number(n)));
    }
}

#[test]
fn text_length_comparisons_count_unicode_and_handle_zero_length() {
    let equal = rule(Kind::TextLength { min: 3.0, max: 3.0 }, Op::Equal);
    assert!(equal.accepts(&Value::Text("中文🙂".into())));
    assert!(!equal.accepts(&Value::Text("中文".into())));
    let outside = rule(Kind::TextLength { min: 2.0, max: 4.0 }, Op::NotBetween);
    assert!(outside.accepts(&Value::Null));
    assert!(outside.accepts(&Value::Text(String::new())));
    assert!(!outside.accepts(&Value::Text("four".into())));
    let mut nonempty = rule(Kind::TextLength { min: 0.0, max: 0.0 }, Op::GreaterThan);
    assert!(!nonempty.accepts(&Value::Null));
    nonempty.ignore_blank = true;
    assert!(nonempty.accepts(&Value::Null));
}

#[test]
fn invalid_ranges_and_list_comparisons_cannot_be_installed() {
    for operator in [Op::Between, Op::NotBetween] {
        assert!(rule(Kind::Decimal { min: 4.0, max: 2.0 }, operator)
            .validate_definition()
            .is_err());
        assert!(rule(
            Kind::Date {
                min: "2026-12-31".into(),
                max: "2026-01-01".into()
            },
            operator
        )
        .validate_definition()
        .is_err());
    }
    assert!(rule(Kind::Decimal { min: 4.0, max: 2.0 }, Op::Equal)
        .validate_definition()
        .is_ok());
    assert!(rule(
        Kind::List {
            items: vec!["a".into()]
        },
        Op::NotEqual
    )
    .validate_definition()
    .is_err());
    assert!(rule(
        Kind::TextLength {
            min: 1.0,
            max: -1.0
        },
        Op::Equal
    )
    .validate_definition()
    .is_err());
}

#[test]
fn rejected_comparison_keeps_formula_history_and_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let range = CellRange::single(CellAddress::new(0, 0));
    book.set_cell_input(0, "A1", "=3").unwrap();
    history
        .set_data_validation(
            &mut book,
            0,
            range,
            Some(rule(
                Kind::WholeNumber { min: 2.0, max: 2.0 },
                Op::GreaterThan,
            )),
        )
        .unwrap();
    history.begin(&book, 0, range, "Edit", true).unwrap();
    book.set_cell_input(0, "A1", "4").unwrap();
    history.finish(&mut book, true).unwrap();
    history.undo(&mut book).unwrap();
    history.begin(&book, 0, range, "Edit", true).unwrap();
    assert_eq!(
        book.set_cell_input(0, "A1", "=2"),
        Err("DATA_VALIDATION_FAILED")
    );
    history.finish(&mut book, false).unwrap();
    assert_eq!(
        book.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=3")
    );
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(4.0));
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    assert!(book
        .sheet(0)
        .unwrap()
        .data_validation_at(CellAddress::new(0, 0))
        .is_none());
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0)
            .unwrap()
            .data_validation_at(CellAddress::new(0, 0))
            .unwrap()
            .operator,
        Op::GreaterThan
    );
}
