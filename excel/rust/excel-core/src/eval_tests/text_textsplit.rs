//! TEXTSPLIT 的二维切分与补位。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === TEXTSPLIT ===

/// TEXTSPLIT happy path with only a column delimiter — produces a 1×N
/// row of fragments.
#[test]
fn eval_textsplit_col_only() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"a,b,c\", \",\")", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
            assert_eq!(arr.get(0, 2), Some(&Value::Text("c".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// TEXTSPLIT with both col and row delimiters builds a rectangular
/// 2D grid; jagged rows are padded by the default pad (`#N/A`).
#[test]
fn eval_textsplit_both_delims() {
    let (cm, vs) = make_test_env();
    // "a,b;c,d,e" → 2 rows of widths 2 and 3.
    match eval_str("=TEXTSPLIT(\"a,b;c,d,e\", \",\", \";\")", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
            // Padded slot.
            assert_eq!(arr.get(0, 2), Some(&Value::Error(ValueError::NotAvailable)));
            assert_eq!(arr.get(1, 0), Some(&Value::Text("c".into())));
            assert_eq!(arr.get(1, 1), Some(&Value::Text("d".into())));
            assert_eq!(arr.get(1, 2), Some(&Value::Text("e".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

#[test]
fn eval_textsplit_pad_error_literal_is_cell_value() {
    let (cm, vs) = make_test_env();
    match eval_str(
        "=TEXTSPLIT(\"a,b;c\", \",\", \";\", FALSE, 0, #N/A)",
        &cm,
        &vs,
    ) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
            assert_eq!(arr.get(1, 0), Some(&Value::Text("c".into())));
            assert_eq!(arr.get(1, 1), Some(&Value::Error(ValueError::NotAvailable)));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

#[test]
fn eval_textsplit_unused_pad_error_is_not_evaluated() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"a,b\", \",\", \";\", FALSE, 0, 1/0)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// TEXTSPLIT empty text → 1×1 array with "" — Excel parity.
#[test]
fn eval_textsplit_empty_text() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"\", \",\")", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 1));
            assert_eq!(arr.get(0, 0), Some(&Value::Text(String::new())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// `ignore_empty = TRUE` drops empty fragments produced by adjacent
/// delimiters. The 3rd row_delim arg is set to "" since our parser
/// doesn't yet support fully-omitted positional args via `,,`.
#[test]
fn eval_textsplit_ignore_empty() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"a,,b,\", \",\", \"\", TRUE)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// Multi-character column delimiter "->" works.
#[test]
fn eval_textsplit_multi_char_delim() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"a->b->c\", \"->\")", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 2), Some(&Value::Text("c".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// TEXTSPLIT supports an ARRAY of column delimiters — any of them
/// splits.
#[test]
fn eval_textsplit_array_of_delims() {
    let (cm, vs) = make_test_env();
    match eval_str("=TEXTSPLIT(\"a,b;c\", {\",\",\";\"})", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
            assert_eq!(arr.get(0, 2), Some(&Value::Text("c".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// `match_mode = 1` matches case-insensitively (ASCII).
#[test]
fn eval_textsplit_case_insensitive_match() {
    let (cm, vs) = make_test_env();
    // Delim "X"; text has "x". match_mode=1 should split.
    match eval_str("=TEXTSPLIT(\"axb\", \"X\", \"\", FALSE, 1)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Text("a".into())));
            assert_eq!(arr.get(0, 1), Some(&Value::Text("b".into())));
        }
        other => panic!("expected array, got {:?}", other),
    }
}

/// Zero-arg TEXTSPLIT → WrongArgCount.
#[test]
fn eval_textsplit_arg_count_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTSPLIT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// Error inside the text arg propagates.
#[test]
fn eval_textsplit_error_propagates() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TEXTSPLIT(A1/C1, \",\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
