//! 公式格算出什么值、以及公式源码的读回。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

// === Step 13: Formula integration ===

#[test]
fn formula_basic_addition() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_cell("B1", Value::Number(20.0));
    sheet.set_formula("C1", "=A1+B1");
    assert_eq!(sheet.get_cell("C1"), Value::Number(30.0));
}

#[test]
fn formula_auto_updates() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_cell("B1", Value::Number(20.0));
    sheet.set_formula("C1", "=A1+B1");
    assert_eq!(sheet.get_cell("C1"), Value::Number(30.0));

    // Change A1 → C1 auto-updates
    sheet.set_cell("A1", Value::Number(100.0));
    assert_eq!(sheet.get_cell("C1"), Value::Number(120.0));
}

#[test]
fn formula_chain() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(5.0));
    sheet.set_formula("B1", "=A1*2");
    sheet.set_formula("C1", "=B1+10");

    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));
    assert_eq!(sheet.get_cell("C1"), Value::Number(20.0));

    sheet.set_cell("A1", Value::Number(10.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(20.0));
    assert_eq!(sheet.get_cell("C1"), Value::Number(30.0));
}

#[test]
fn formula_with_literal() {
    let mut sheet = Sheet::new();
    sheet.set_formula("A1", "=42");
    assert_eq!(sheet.get_cell("A1"), Value::Number(42.0));
}

#[test]
fn formula_division_by_zero() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_cell("B1", Value::Number(0.0));
    sheet.set_formula("C1", "=A1/B1");
    assert_eq!(
        sheet.get_cell("C1"),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn formula_error_recovers_through_store_derivation() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(0.0));
    sheet.set_formula("B1", "=1/A1");

    assert_eq!(
        sheet.get_cell("B1"),
        Value::Error(ValueError::DivisionByZero)
    );
    let evals_before = sheet.debug_formula_eval_count();

    sheet.set_cell("A1", Value::Number(2.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(0.5));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);

    assert_eq!(sheet.get_cell("B1"), Value::Number(0.5));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);
}

#[test]
fn formula_sum_function() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("C1", Value::Number(3.0));
    sheet.set_formula("D1", "=SUM(A1,B1,C1)");
    assert_eq!(sheet.get_cell("D1"), Value::Number(6.0));
}

#[test]
fn formula_cleared_by_set_cell() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(20.0));

    // Clear formula by setting a value directly
    sheet.set_cell("B1", Value::Number(99.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(99.0));

    // Changing A1 should no longer affect B1
    sheet.set_cell("A1", Value::Number(1.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(99.0));
}

#[test]
fn get_formula_returns_source_text() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    // Cell with no formula: None
    assert_eq!(sheet.get_formula("A1"), None);

    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_formula("B1").as_deref(), Some("=A1*2"));

    // Setting a value clears the formula text
    sheet.set_cell("B1", Value::Number(99.0));
    assert_eq!(sheet.get_formula("B1"), None);

    // Replacing a formula updates the stored text
    sheet.set_formula("B1", "=A1+1");
    assert_eq!(sheet.get_formula("B1").as_deref(), Some("=A1+1"));

    // Unparseable formula clears the stored text (cell becomes #VALUE!).
    // After Expr::Name was added for LET support, bare identifiers like
    // `=garbage` now PARSE successfully (they evaluate to #NAME? at
    // read time, matching Excel semantics). To test the "cannot parse"
    // branch we use an unmatched paren — there's no surface syntax
    // that can rescue it.
    sheet.set_formula("B1", "=(");
    assert_eq!(sheet.get_formula("B1"), None);
}

#[test]
fn absolute_refs_install_read_back_and_evaluate() {
    // The reported bug: `set_formula` returned FALSE for any `$` formula
    // and the cell became Error(InvalidValue). It must now install, read
    // back verbatim, and evaluate identically to the relative twin.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_cell("A2", Value::Number(3.0));

    assert!(sheet.set_formula("B1", "=$A$1+1"), "=$A$1+1 must install");
    assert_eq!(sheet.get_formula("B1").as_deref(), Some("=$A$1+1"));
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));

    // Mixed ref and an absolute range evaluate like their relative twins.
    assert!(sheet.set_formula("B2", "=SUM($A$1:$A2)"));
    assert_eq!(sheet.get_formula("B2").as_deref(), Some("=SUM($A$1:$A2)"));
    assert_eq!(sheet.get_cell("B2"), Value::Number(5.0));

    // A pure absolute ref (no binop, so no render parens) read back
    // verbatim, then structurally retargeted through the REAL Sheet path.
    assert!(sheet.set_formula("C1", "=$A$1"));
    assert_eq!(sheet.get_formula("C1").as_deref(), Some("=$A$1"));

    // Inserting a row at the top shifts `$A$1`→`$A$2` while keeping the
    // `$` markers — the re-rendered `get_formula` text proves it.
    sheet.insert_row(0, 1);
    assert_eq!(sheet.get_formula("C2").as_deref(), Some("=$A$2"));
}

#[test]
fn formula_references_unset_cell() {
    let mut sheet = Sheet::new();
    // B1 not set, should be Null → coerced to 0
    sheet.set_cell("A1", Value::Number(5.0));
    sheet.set_formula("C1", "=A1+B1");
    assert_eq!(sheet.get_cell("C1"), Value::Number(5.0));
}

#[test]
fn invalid_formula_writes_error_not_panic() {
    // B.3: parse failure must not panic the wasm instance.
    let mut sheet = Sheet::new();
    let ok = sheet.set_formula("A1", "=foo bar baz");
    assert!(!ok);
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::InvalidValue));

    // Subsequent valid formula on the same cell should clear the error.
    let ok = sheet.set_formula("A1", "=42");
    assert!(ok);
    assert_eq!(sheet.get_cell("A1"), Value::Number(42.0));
}

#[test]
fn set_cell_releases_old_formula_record() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.debug_formula_count(), 1);

    sheet.set_cell("B1", Value::Number(5.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(5.0));
    assert_eq!(sheet.debug_formula_count(), 0);
}
