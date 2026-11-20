use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::subtotal::{
    SubtotalAction, SubtotalCalculation, SubtotalFunction, SubtotalPlacement, SubtotalRequest,
    SubtotalSettings,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> CellRange {
    CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1))
}

fn sum() -> SubtotalAction {
    SubtotalAction::Apply(SubtotalSettings {
        group_by_column: 0,
        calculation: SubtotalCalculation {
            function: SubtotalFunction::Sum,
            columns: vec![1],
        },
        placement: SubtotalPlacement::Below,
        replace: true,
        total_suffix: " Total".into(),
        grand_total: "Grand Total".into(),
    })
}

fn request(action: SubtotalAction) -> SubtotalRequest {
    SubtotalRequest {
        sheet: 0,
        selection: range(0, 0, 2, 1),
        row_count: 32,
        col_count: 8,
        action,
    }
}

fn fixture() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (address, label) in [
        ("A1", "Region"),
        ("B1", "Qty"),
        ("A2", "East"),
        ("A3", "West"),
    ] {
        book.set_cell(0, address, Value::Text(label.into()));
    }
    book.set_cell(0, "B2", Value::Number(2.));
    book.set_cell(0, "B3", Value::Number(3.));
    history
        .change_subtotals(&mut book, &request(sum()))
        .unwrap();
    (book, history)
}

fn rule() -> DataValidationRule {
    DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 0., max: 20. },
        ignore_blank: true,
        operator: Default::default(),
        options: Default::default(),
    }
}

#[test]
fn removing_or_replacing_totals_preserves_a_rule_with_no_surviving_rows() {
    for action in [SubtotalAction::Remove, sum()] {
        let (mut book, mut history) = fixture();
        // East's summary is row 3. The rule in H3 is independent of every subtotal formula.
        let target = range(2, 7, 2, 7);
        history
            .set_data_validation(&mut book, 0, target, Some(rule()))
            .unwrap();
        let original = book.sheet(0).unwrap().data_validations().to_vec();
        let error = history
            .change_subtotals(&mut book, &request(action))
            .unwrap_err();
        assert!(error.contains("data validation"));
        assert_eq!(
            book.get_cell("Sheet1", "A3"),
            Value::Text("East Total".into())
        );
        assert_eq!(book.sheet(0).unwrap().data_validations(), &original);
        assert_eq!(history.undo_count(), 2);
    }
}

#[test]
fn validation_that_also_applies_to_a_detail_row_keeps_that_row_after_removal() {
    let (mut book, mut history) = fixture();
    history
        .set_data_validation(&mut book, 0, range(2, 7, 3, 7), Some(rule()))
        .unwrap();
    history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove))
        .unwrap()
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("West".into()));
    assert_eq!(
        book.sheet(0).unwrap().data_validations()[0].range,
        range(2, 7, 2, 7)
    );
}

#[test]
fn conditional_formatting_with_a_surviving_area_follows_the_detail_rows() {
    use einfach_excel_core::workbook::ConditionalFormatRuleEntry;
    let (mut book, mut history) = fixture();
    let mut formatting = ConditionalFormatRuleEntry {
        id: "custom-summary".into(),
        row_start: 2,
        row_end: 2,
        col_start: 7,
        col_end: 7,
        additional_ranges: Vec::new(),
        priority: 0,
        rule_json: r#"{"kind":"cell-value","operator":"gt","value":"0"}"#.into(),
    };
    let initial = book
        .set_conditional_format_rule(0, 0, formatting.clone())
        .unwrap();
    let error = history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove))
        .unwrap_err();
    assert!(error.contains("conditional formatting"));
    assert_eq!(book.conditional_format_config(0).unwrap(), initial);
    formatting.additional_ranges.push(range(3, 7, 3, 7));
    book.set_conditional_format_rule(0, initial.revision, formatting)
        .unwrap();
    history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove))
        .unwrap()
        .unwrap();
    let after = book.conditional_format_config(0).unwrap();
    assert_eq!(after.rules[0].row_start, 2);
    assert!(after.rules[0].additional_ranges.is_empty());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("West".into()));
}

#[test]
fn an_independent_outline_group_is_preserved_if_it_has_no_surviving_rows() {
    use einfach_excel_core::outline::{OutlineAction, OutlineAxis};
    let (mut book, mut history) = fixture();
    history
        .change_outline(
            &mut book,
            0,
            OutlineAxis::Row,
            OutlineAction::Group { start: 2, end: 2 },
        )
        .unwrap();
    let outline = book.sheet(0).unwrap().outline().clone();
    let error = history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove))
        .unwrap_err();
    assert!(error.contains("independent worksheet settings"));
    assert_eq!(book.sheet(0).unwrap().outline(), &outline);
    assert_eq!(history.undo_count(), 2);
}
