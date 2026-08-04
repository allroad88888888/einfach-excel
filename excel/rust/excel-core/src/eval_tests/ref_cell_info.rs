//! CELL 各 info_type 分支与 FORMULATEXT 的单元格元数据。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_cell_address() {
    let (cm, vs) = make_test_env();
    // Happy path: explicit cell ref → $A1$-style absolute.
    assert_eq!(
        eval_str("=CELL(\"address\",B2)", &cm, &vs),
        Value::Text("$B$2".into())
    );
    assert_eq!(
        eval_str("=CELL(\"address\",AB27)", &cm, &vs),
        Value::Text("$AB$27".into())
    );
    // Case insensitivity: info_type is lowercased.
    assert_eq!(
        eval_str("=CELL(\"ADDRESS\",A1)", &cm, &vs),
        Value::Text("$A$1".into())
    );
    // Multi-cell range → top-left.
    assert_eq!(
        eval_str("=CELL(\"address\",B2:D4)", &cm, &vs),
        Value::Text("$B$2".into())
    );
    // Non-ref expression → WrongType.
    assert_eq!(
        eval_str("=CELL(\"address\",\"not-a-ref\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_cell_row() {
    let (cm, vs) = make_test_env();
    // 1-based row, not 0-based.
    assert_eq!(eval_str("=CELL(\"row\",A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=CELL(\"row\",B2)", &cm, &vs), Value::Number(2.0));
}

#[test]
fn eval_cell_col() {
    let (cm, vs) = make_test_env();
    // Both "col" and "column" are accepted (Excel parity).
    assert_eq!(eval_str("=CELL(\"col\",A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(
        eval_str("=CELL(\"column\",A1)", &cm, &vs),
        Value::Number(1.0)
    );
    assert_eq!(eval_str("=CELL(\"col\",B2)", &cm, &vs), Value::Number(2.0));
}

#[test]
fn eval_cell_contents() {
    let (cm, vs) = make_test_env();
    // A1=10 in make_test_env.
    assert_eq!(
        eval_str("=CELL(\"contents\",A1)", &cm, &vs),
        Value::Number(10.0)
    );
    // B2="text".
    assert_eq!(
        eval_str("=CELL(\"contents\",B2)", &cm, &vs),
        Value::Text("text".into())
    );
}

#[test]
fn eval_cell_type() {
    let (cm, vs) = make_test_env();
    // Number → "v".
    assert_eq!(
        eval_str("=CELL(\"type\",A1)", &cm, &vs),
        Value::Text("v".into())
    );
    // Text → "l".
    assert_eq!(
        eval_str("=CELL(\"type\",B2)", &cm, &vs),
        Value::Text("l".into())
    );
    // Empty cell (no entry in cell_map → Value::Null) → "b".
    assert_eq!(
        eval_str("=CELL(\"type\",Z99)", &cm, &vs),
        Value::Text("b".into())
    );
}

#[test]
fn eval_cell_prefix() {
    let (cm, vs) = make_test_env();
    // Text → "'".
    assert_eq!(
        eval_str("=CELL(\"prefix\",B2)", &cm, &vs),
        Value::Text("'".into())
    );
    // Non-text → "".
    assert_eq!(
        eval_str("=CELL(\"prefix\",A1)", &cm, &vs),
        Value::Text(String::new())
    );
}

#[test]
fn eval_cell_width() {
    let (cm, vs) = make_test_env();
    // The test env's provider has no per-column width map (`col_width`
    // returns the trait default `None`), so `CELL("width")` falls back to
    // Excel's default column width of 8 characters. Explicit-width
    // conversion (px → chars) is covered end-to-end in
    // `tests/cell_function.rs`, which drives a real sheet-backed provider.
    assert_eq!(
        eval_str("=CELL(\"width\",A1)", &cm, &vs),
        Value::Number(8.0)
    );
}

#[test]
fn eval_cell_protect() {
    let (cm, vs) = make_test_env();
    // Approximation: every cell reports as locked.
    assert_eq!(
        eval_str("=CELL(\"protect\",A1)", &cm, &vs),
        Value::Number(1.0)
    );
}

#[test]
fn eval_cell_errors() {
    let (cm, vs) = make_test_env();
    // Non-text info_type → WrongType.
    assert_eq!(
        eval_str("=CELL(42,A1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Unknown info_type → InvalidValue.
    assert_eq!(
        eval_str("=CELL(\"nope\",A1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=CELL()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=CELL(\"row\",A1,B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_cell_no_ref_legacy_provider() {
    // note: AtomEvalProvider doesn't carry current-cell, so the no-arg
    // path resolves to None → InvalidRef. The production
    // WorkbookEvalProvider path is covered in tests/cell_function.rs.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CELL(\"row\")", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
}

// === FORMULATEXT ===

/// FORMULATEXT on a primitive cell surfaces `#N/A` via
/// the AtomEvalProvider's default `cell_formula_text` returning None.
/// (Sheet/Workbook round-trip is exercised in the integration tests.)
#[test]
fn eval_formulatext_on_primitive_returns_na() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=FORMULATEXT(A1)", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
}

#[test]
fn eval_formulatext_arg_count_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=FORMULATEXT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// A non-ref argument is a type error per the spec.
#[test]
fn eval_formulatext_non_ref_arg() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=FORMULATEXT(42)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
