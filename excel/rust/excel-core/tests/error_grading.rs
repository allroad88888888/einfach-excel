//! Tests for finer-grained `ValueError` variants added in Goal A.
//!
//! Each test asserts that a specific formula or function call produces the
//! *new* specific error code rather than the former catch-all `InvalidValue`.
//!
//! Variants covered:
//! - `ValueError::Overflow`     — non-finite numeric result (#NUM!)
//! - `ValueError::WrongType`    — built-in argument-type rejection. An
//!   ENGINE-INTERNAL diagnostic: a cell holding it DISPLAYS `#VALUE!` (Excel
//!   has no `#TYPE!`; the collapse lives in `format::error_display_token`).
//!   Tests below assert the variant, so they name `WrongType` — never read
//!   that as "the user sees #TYPE!". Not the arithmetic operators either:
//!   `=A1+1` / `=-A1` on text grade as `InvalidValue`, matching Excel and the
//!   TS reference engine in cross-engine parity runs.
//! - `ValueError::WrongArgCount`— wrong argument count. Also an ENGINE-INTERNAL
//!   diagnostic: a cell holding it DISPLAYS `#VALUE!`. Excel rejects a wrong
//!   argument count at ENTRY TIME with a dialog, so it has no cell error code
//!   for this at all; the collapse lives in `format::error_display_token`
//!   alongside `WrongType`'s. Tests below assert the VARIANT, so they name
//!   `WrongArgCount` — never read that as "the user sees #ARGS!".
//!
//! Pre-existing variants (`DivisionByZero`, `InvalidName`, `InvalidRef`,
//! `CyclicRef`) are not tested here — they already had dedicated tests.

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

// ── helpers ────────────────────────────────────────────────────────────────

fn wb_eval(formula: &str) -> Value {
    let mut wb = Workbook::new();
    wb.set_formula(0, "Z99", formula);
    wb.get_cell("Sheet1", "Z99")
}

// ── Overflow (#NUM!) ────────────────────────────────────────────────────────

/// `^` operator: a very large number squared overflows f64 → Overflow.
/// We put the large value in a cell (since the parser lacks scientific notation)
/// and raise it to a high power via the `^` operator.
#[test]
fn binop_pow_overflow_is_overflow() {
    let mut wb = Workbook::new();
    // 9e307 stored in A1; A1^2 will overflow f64 (max ≈ 1.8e308).
    wb.set_cell(0, "A1", Value::Number(9e307_f64));
    wb.set_formula(0, "Z99", "=A1^2");
    let v = wb.get_cell("Sheet1", "Z99");
    assert_eq!(
        v,
        Value::Error(ValueError::Overflow),
        "9e307^2 should produce #NUM!, got {:?}",
        v
    );
}

/// POWER(large, 2) → Overflow.
#[test]
fn power_func_overflow_is_overflow() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(9e307_f64));
    wb.set_formula(0, "Z99", "=POWER(A1,2)");
    let v = wb.get_cell("Sheet1", "Z99");
    assert_eq!(
        v,
        Value::Error(ValueError::Overflow),
        "POWER(9e307, 2) should produce #NUM!, got {:?}",
        v
    );
}

/// SQRT of a negative number → Overflow (Excel: #NUM!).
#[test]
fn sqrt_negative_is_overflow() {
    let v = wb_eval("=SQRT(-1)");
    assert_eq!(
        v,
        Value::Error(ValueError::Overflow),
        "SQRT(-1) should produce #NUM!, got {:?}",
        v
    );
}

/// ABS of a value that produces non-finite via the unary_number helper
/// shouldn't happen for ABS itself, but the helper's overflow path is
/// exercised by CEILING/FLOOR on infinity-producing inputs.
/// Use POWER overflow path via the `^` operator as the canonical test.
#[test]
fn pow_zero_negative_exp_is_division_by_zero() {
    // 0^(-1) → DivisionByZero, not Overflow — this verifies the branching
    // inside eval_binop is still correct after the Overflow change.
    let v = wb_eval("=0^(-1)");
    assert_eq!(
        v,
        Value::Error(ValueError::DivisionByZero),
        "0^(-1) should stay DivisionByZero, got {:?}",
        v
    );
}

// ── WrongType (shown as #VALUE!) ───────────────────────────────────────────

/// Text added to a number → `#VALUE!`. The arithmetic operators follow Excel,
/// not the engine-private `WrongType` grading: Excel answers `=1+"x"` with
/// `#VALUE!` and has no `#TYPE!` code at all.
#[test]
fn text_plus_number_is_invalid_value() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("hello".into()));
    wb.set_formula(0, "B1", "=A1+1");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::InvalidValue),
        "text+number should produce #VALUE!, got {:?}",
        v
    );
}

/// Negation of a text value → `#VALUE!`, same Excel rule as the binary
/// arithmetic operators.
#[test]
fn negate_text_is_invalid_value() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("abc".into()));
    wb.set_formula(0, "B1", "=-A1");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::InvalidValue),
        "-text should produce #VALUE!, got {:?}",
        v
    );
}

/// ROUND with a text second argument → WrongType.
#[test]
fn round_text_digits_is_wrong_type() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("two".into()));
    wb.set_formula(0, "B1", "=ROUND(3.14,A1)");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongType),
        "ROUND(num, text) should produce WrongType (shown as #VALUE!), got {:?}",
        v
    );
}

/// MOD with a text divisor → WrongType.
#[test]
fn mod_text_divisor_is_wrong_type() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("x".into()));
    wb.set_formula(0, "B1", "=MOD(10,A1)");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongType),
        "MOD(10, text) should produce WrongType (shown as #VALUE!), got {:?}",
        v
    );
}

/// NOT with a text argument → WrongType.
#[test]
fn not_text_is_wrong_type() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("yes".into()));
    wb.set_formula(0, "B1", "=NOT(A1)");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongType),
        "NOT(text) should produce WrongType (shown as #VALUE!), got {:?}",
        v
    );
}

/// SQRT with a text argument → WrongType (not Overflow — negative is Overflow,
/// non-numeric is WrongType).
#[test]
fn sqrt_text_is_wrong_type() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("four".into()));
    wb.set_formula(0, "B1", "=SQRT(A1)");
    let v = wb.get_cell("Sheet1", "B1");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongType),
        "SQRT(text) should produce WrongType (shown as #VALUE!), got {:?}",
        v
    );
}

// ── WrongArgCount (internal #ARGS!, displayed #VALUE!) ─────────────────────

/// IF with only 1 argument → WrongArgCount.
#[test]
fn if_one_arg_is_wrong_arg_count() {
    let v = wb_eval("=IF(1)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "IF(1) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// IF with 4 arguments → WrongArgCount.
#[test]
fn if_four_args_is_wrong_arg_count() {
    let v = wb_eval("=IF(1,2,3,4)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "IF(1,2,3,4) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// ROUND with 1 argument → WrongArgCount.
#[test]
fn round_one_arg_is_wrong_arg_count() {
    let v = wb_eval("=ROUND(3.14)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "ROUND(3.14) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// NOT with 0 arguments → WrongArgCount.
#[test]
fn not_zero_args_is_wrong_arg_count() {
    // NOT() won't parse (zero-arg call is still a function call with empty args).
    // Use LEN as the representative 1-arg function instead.
    let v = wb_eval("=LEN()");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "LEN() should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// VLOOKUP with only 2 arguments → WrongArgCount.
#[test]
fn vlookup_two_args_is_wrong_arg_count() {
    let v = wb_eval("=VLOOKUP(1,A1)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "VLOOKUP(1,A1) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// MOD with 1 argument → WrongArgCount.
#[test]
fn mod_one_arg_is_wrong_arg_count() {
    let v = wb_eval("=MOD(10)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "MOD(10) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

/// LARGE with 1 argument → WrongArgCount.
#[test]
fn large_one_arg_is_wrong_arg_count() {
    let v = wb_eval("=LARGE(A1)");
    assert_eq!(
        v,
        Value::Error(ValueError::WrongArgCount),
        "LARGE(A1) should produce WrongArgCount (shown as #VALUE!), got {:?}",
        v
    );
}

// ── Display strings for the new variants ───────────────────────────────────

#[test]
fn overflow_displays_num() {
    assert_eq!(format!("{}", ValueError::Overflow), "#NUM!");
}

/// Pins the ENGINE-INTERNAL spelling, NOT what a user sees. `Display` doubles
/// as the formula-text serializer (`shift::render_formula`), and its output
/// must re-parse via `formula::parse_error_literal`, which still maps `#TYPE!`
/// to `WrongType` — change this token and stored `=IF(A1,#TYPE!,1)` stops
/// round-tripping. The USER-FACING token is `#VALUE!`, from
/// `format::error_display_token` (asserted in `format.rs`).
#[test]
fn wrong_type_displays_type() {
    assert_eq!(format!("{}", ValueError::WrongType), "#TYPE!");
}

/// Pins the ENGINE-INTERNAL spelling, NOT what a user sees — same split as
/// `wrong_type_displays_type` above. `Display` doubles as the formula-text
/// serializer, and its output must re-parse via `formula::parse_error_literal`,
/// which still maps `#ARGS!` to `WrongArgCount`. The USER-FACING token is
/// `#VALUE!`, from `format::error_display_token` (asserted in `format.rs`).
#[test]
fn wrong_arg_count_displays_args() {
    assert_eq!(format!("{}", ValueError::WrongArgCount), "#ARGS!");
}
