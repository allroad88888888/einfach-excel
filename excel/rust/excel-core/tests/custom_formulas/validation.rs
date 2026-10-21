use einfach_core::Value;
use einfach_excel_core::custom_formulas::{CustomFormulaAction, CustomFormulaDefinition};
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CustomFunctionRegistry, Workbook};
use std::sync::Arc;

fn action(name: &str, parameters: &[&str], expression: &str) -> CustomFormulaAction {
    CustomFormulaAction::Upsert {
        definition: CustomFormulaDefinition {
            name: name.into(),
            parameters: parameters.iter().map(|v| (*v).into()).collect(),
            expression: expression.into(),
        },
    }
}

#[test]
fn invalid_definition_and_static_call_cycles_are_atomic_and_preserve_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_custom_formula(&mut book, 0, action("GOOD", &["x"], "=x+1"))
        .unwrap();
    history.undo(&mut book).unwrap();
    for candidate in [
        action("SUM", &["x"], "=x"),
        action("A1", &["x"], "=x"),
        action("R1C1", &["x"], "=x"),
        action("BAD", &["x", "X"], "=x"),
        action("BAD", &["A1"], "=A1"),
        action("BAD", &["x"], "=x+"),
        action("SELF", &["x"], "=SELF(x)"),
        action("BAD", &["x"], "=A1+x"),
        action("BAD", &[], "=Sheet1!A1"),
        action("BAD", &[], "=INDIRECT(\"A1\")"),
        action("BAD", &[], "=ROW()"),
        action("BAD", &["x"], "=global_name+x"),
        action("BAD", &["x"], "=UNKNOWN(x)"),
        action("BAD", &[], "=LET(local,local+1,local)"),
        action("BAD", &[], "=LAMBDA(x,x,x)(1)"),
    ] {
        assert!(
            history
                .change_custom_formula(&mut book, 0, candidate.clone())
                .is_err(),
            "{candidate:?}"
        );
        assert!(book.custom_formula_definitions().is_empty());
        assert_eq!(history.redo_count(), 1);
    }
    history.redo(&mut book).unwrap();
    history
        .change_custom_formula(&mut book, 0, action("FIRST", &["x"], "=x"))
        .unwrap();
    history
        .change_custom_formula(&mut book, 0, action("INNERFN", &["x"], "=FIRST(x)"))
        .unwrap();
    assert!(history
        .change_custom_formula(&mut book, 0, action("FIRST", &["x"], "=INNERFN(x)"))
        .is_err());
    assert_eq!(book.custom_formula_definitions().len(), 3);
}

#[test]
fn named_ranges_and_existing_host_callback_names_cannot_be_redefined() {
    #[derive(Debug)]
    struct Host;
    impl CustomFunctionRegistry for Host {
        fn lookup(&self, name: &str, _: &[Value]) -> Option<Value> {
            (name == "HOST").then_some(Value::Number(9.0))
        }
        fn contains(&self, name: &str) -> bool {
            name == "HOST"
        }
    }
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.define_name_value("global_name", Value::Number(7.0))
        .unwrap();
    book.define_named_range(
        "GLOBAL_RANGE",
        0,
        einfach_excel_core::CellRange::single(einfach_excel_core::CellAddress::new(0, 0)),
    )
    .unwrap();
    book.set_custom_function_registry(Some(Arc::new(Host)));
    assert!(history
        .change_custom_formula(&mut book, 0, action("GLOBAL_NAME", &["x"], "=x"))
        .is_err());
    assert!(history
        .change_custom_formula(&mut book, 0, action("HOST", &["x"], "=x"))
        .is_err());
    assert!(history
        .change_custom_formula(&mut book, 0, action("BAD", &[], "=global_name"))
        .is_err());
    assert!(history
        .change_custom_formula(&mut book, 0, action("BAD", &[], "=SUM(GLOBAL_RANGE)"))
        .is_err());
    book.set_formula(0, "A1", "=HOST()");
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(9.0));
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn protected_workbook_rejects_registration_replacement_removal_and_replay_before_writes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_custom_formula(&mut book, 0, action("GOOD", &["x"], "=x+1"))
        .unwrap();
    book.add_sheet("Locked");
    book.change_protection(1, ProtectionChange::Protect)
        .unwrap();
    let before = book.custom_formula_definitions();
    for candidate in [
        action("NEW", &[], "=1"),
        action("GOOD", &["x"], "=x+2"),
        CustomFormulaAction::Remove {
            name: "GOOD".into(),
        },
    ] {
        assert!(history
            .change_custom_formula(&mut book, 0, candidate)
            .is_err());
        assert_eq!(book.custom_formula_definitions(), before);
        assert_eq!(history.undo_count(), 1);
    }
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.custom_formula_definitions(), before);
}

#[test]
fn noops_keep_history_and_invalid_restore_is_atomic() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    assert!(history
        .change_custom_formula(&mut book, 0, action("GOOD", &["x"], "=x+1"))
        .unwrap());
    assert!(!history
        .change_custom_formula(&mut book, 0, action("good", &["x"], "=x+1"))
        .unwrap());
    assert!(!history
        .change_custom_formula(
            &mut book,
            0,
            CustomFormulaAction::Remove {
                name: "MISSING".into()
            }
        )
        .unwrap());
    assert_eq!(history.undo_count(), 1);
    let mut restored = Workbook::new();
    let mut duplicate = book.custom_formula_definitions();
    duplicate.extend(duplicate.clone());
    assert!(restored
        .restore_custom_formula_definitions(duplicate)
        .is_err());
    assert!(restored.custom_formula_definitions().is_empty());
}
