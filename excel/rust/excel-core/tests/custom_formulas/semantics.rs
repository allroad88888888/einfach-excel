use einfach_core::{Value, ValueError};
use einfach_excel_core::custom_formulas::{CustomFormulaAction, CustomFormulaDefinition};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellFormat, Workbook};

fn definition(name: &str, parameters: &[&str], expression: &str) -> CustomFormulaDefinition {
    CustomFormulaDefinition {
        name: name.into(),
        parameters: parameters.iter().map(|v| (*v).into()).collect(),
        expression: expression.into(),
    }
}
fn upsert(
    book: &mut Workbook,
    history: &mut WorkbookHistory,
    name: &str,
    parameters: &[&str],
    expression: &str,
) {
    assert!(history
        .change_custom_formula(
            book,
            0,
            CustomFormulaAction::Upsert {
                definition: definition(name, parameters, expression),
            }
        )
        .unwrap());
}

#[test]
fn native_registry_register_replace_remove_recomputes_cross_sheet_consumers_and_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.add_sheet("Other");
    book.set_cell_input(0, "A1", "7").unwrap();
    book.set_cell_input(0, "B1", "neighbor").unwrap();
    book.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    book.set_formula(0, "C1", "=DOUBLE(A1)");
    book.set_formula(1, "A1", "=Sheet1!C1+1");
    assert_eq!(
        book.get_cell("Other", "A1"),
        Value::Error(ValueError::InvalidName)
    );
    upsert(&mut book, &mut history, "double", &["amount"], "amount*2");
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(15.0));
    assert_eq!(
        book.custom_formula_definitions(),
        vec![definition("DOUBLE", &["AMOUNT"], "=amount*2")]
    );
    upsert(&mut book, &mut history, "DOUBLE", &["amount"], "=amount*3");
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(22.0));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(15.0));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(22.0));
    assert!(history
        .change_custom_formula(
            &mut book,
            0,
            CustomFormulaAction::Remove {
                name: "double".into()
            }
        )
        .unwrap());
    assert_eq!(
        book.get_cell("Other", "A1"),
        Value::Error(ValueError::InvalidName)
    );
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(22.0));
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.get_cell("Other", "A1"),
        Value::Error(ValueError::InvalidName)
    );
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(
        book.get_cell("Sheet1", "B1"),
        Value::Text("neighbor".into())
    );
    assert!(book.sheet(0).unwrap().effective_format("A1").bold);
    assert_eq!(
        book.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=DOUBLE(A1)")
    );
}

#[test]
fn native_errors_arity_zero_parameters_lexical_binding_and_nested_custom_calls() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    upsert(&mut book, &mut history, "DOUBLE", &["x"], "=x*2");
    upsert(
        &mut book,
        &mut history,
        "NESTED",
        &["value"],
        "=LET(local,DOUBLE(value),LAMBDA(extra,local+extra)(1))",
    );
    upsert(&mut book, &mut history, "ANSWER", &[], "=42");
    upsert(
        &mut book,
        &mut history,
        "TOTAL",
        &["values"],
        "=SUM(values)",
    );
    book.set_cell_input(0, "D1", "2").unwrap();
    book.set_cell_input(0, "D2", "3").unwrap();
    for (address, formula, expected) in [
        ("A1", "=NESTED(5)", Value::Number(11.0)),
        ("A2", "=DOUBLE()", Value::Error(ValueError::WrongArgCount)),
        (
            "A3",
            "=DOUBLE(1,2)",
            Value::Error(ValueError::WrongArgCount),
        ),
        (
            "A4",
            "=DOUBLE(1/0)",
            Value::Error(ValueError::DivisionByZero),
        ),
        ("A5", "=ANSWER()", Value::Number(42.0)),
        ("A6", "=TOTAL(D1:D2)", Value::Number(5.0)),
    ] {
        book.set_formula(0, address, formula);
        assert_eq!(book.get_cell("Sheet1", address), expected, "{formula}");
    }
}

#[test]
fn array_definition_replacement_reprojects_and_clears_native_spill() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    upsert(
        &mut book,
        &mut history,
        "NUMBERS",
        &["count"],
        "=SEQUENCE(count)",
    );
    book.set_formula(0, "A1", "=NUMBERS(3)");
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
    upsert(
        &mut book,
        &mut history,
        "NUMBERS",
        &["count"],
        "=SEQUENCE(1)",
    );
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
}

#[test]
fn native_definition_json_roundtrip_is_data_only_and_supports_forward_references() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    upsert(&mut book, &mut history, "INNERFN", &["x"], "=x*2");
    upsert(&mut book, &mut history, "FIRST", &["x"], "=INNERFN(x)+1");
    let json = serde_json::to_string(&book.custom_formula_definitions()).unwrap();
    let mut restored = Workbook::new();
    restored
        .restore_custom_formula_definitions(serde_json::from_str(&json).unwrap())
        .unwrap();
    restored.set_formula(0, "A1", "=FIRST(4)");
    assert_eq!(restored.get_cell("Sheet1", "A1"), Value::Number(9.0));
    assert_eq!(
        restored.custom_formula_definitions(),
        book.custom_formula_definitions()
    );
    assert!(serde_json::from_str::<CustomFormulaDefinition>(
        r#"{"name":"EVIL","parameters":[],"expression":"=1","source":"alert(1)"}"#
    )
    .is_err());
}

#[test]
fn removed_nested_dependency_roundtrips_as_error_without_calling_unrelated_global_lambda() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    upsert(&mut book, &mut history, "INNERFN", &["x"], "=x*2");
    upsert(&mut book, &mut history, "FIRST", &["x"], "=INNERFN(x)+1");
    history
        .change_custom_formula(
            &mut book,
            0,
            CustomFormulaAction::Remove {
                name: "INNERFN".into(),
            },
        )
        .unwrap();
    let definitions = book.custom_formula_definitions();
    book.define_name("INNERFN", "=LAMBDA(x,100)").unwrap();
    book.set_formula(0, "A1", "=FIRST(4)");
    assert_eq!(
        book.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidName)
    );
    let mut restored = Workbook::new();
    restored
        .restore_custom_formula_definitions(definitions)
        .unwrap();
    restored.set_formula(0, "A1", "=FIRST(4)");
    assert_eq!(
        restored.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidName)
    );
}
