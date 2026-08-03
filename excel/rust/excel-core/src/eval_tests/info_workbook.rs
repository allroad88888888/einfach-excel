//! ISFORMULA/SHEET/SHEETS/INFO 对工作簿与运行环境的信息查询。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_isformula_non_ref_is_error() {
    // The legacy in-file AtomEvalProvider can't model formula cells —
    // but ISFORMULA still distinguishes "ref vs not-a-ref".
    assert_eq!(
        ev("=ISFORMULA(\"abc\")"),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        ev("=ISFORMULA(1+2)"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_isformula_cellref_with_no_provider_returns_false() {
    // AtomEvalProvider has no formula data, so the default
    // `cell_has_formula` returns false. The "TRUE on formula cell"
    // path is exercised in `tests/text_info_extras.rs` via Workbook.
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISFORMULA(A1)", &cm, &vs), Value::Boolean(false));
}

#[test]
fn eval_isformula_arg_count() {
    assert_eq!(ev("=ISFORMULA()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(
        ev("=ISFORMULA(A1,B1)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_sheet_no_arg_default_provider_is_ref_error() {
    // AtomEvalProvider has no current sheet → #REF!.
    assert_eq!(ev("=SHEET()"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn eval_sheet_non_ref_is_error() {
    assert_eq!(
        ev("=SHEET(\"hello\")"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_sheet_arg_count() {
    assert_eq!(
        ev("=SHEET(A1, B1)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_sheets_no_arg_default_provider_returns_one() {
    // Default sheet_count() is 1 — single-sheet shims report exactly one.
    assert_eq!(ev("=SHEETS()"), Value::Number(1.0));
}

#[test]
fn eval_sheets_with_ref_returns_one() {
    // A 2-D ref spans exactly one sheet (we don't model 3-D refs).
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SHEETS(A1:B2)", &cm, &vs), Value::Number(1.0));
}

#[test]
fn eval_info_known_subtypes() {
    assert_eq!(ev("=INFO(\"directory\")"), Value::Text(String::new()));
    assert_eq!(ev("=INFO(\"numfile\")"), Value::Number(1.0));
    assert_eq!(ev("=INFO(\"osversion\")"), Value::Text(String::new()));
    assert_eq!(ev("=INFO(\"recalc\")"), Value::Text("Automatic".into()));
    match ev("=INFO(\"release\")") {
        Value::Text(s) => assert!(s.starts_with("einfach-"), "got: {}", s),
        other => panic!("expected Value::Text, got {:?}", other),
    }
}

#[test]
fn eval_info_system_on_mac() {
    assert_eq!(ev("=INFO(\"system\")"), Value::Text("mac".into()));
}

#[test]
#[cfg(target_os = "windows")]
fn eval_info_system_on_windows() {
    assert_eq!(ev("=INFO(\"system\")"), Value::Text("pc".into()));
}

#[test]
fn eval_info_unknown_subtype() {
    assert_eq!(
        ev("=INFO(\"bogus\")"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_info_arg_count() {
    assert_eq!(ev("=INFO()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(
        ev("=INFO(\"a\", \"b\")"),
        Value::Error(ValueError::WrongArgCount)
    );
}
