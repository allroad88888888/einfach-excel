//! AVERAGEIF 的单条件平均。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

// ---- AVERAGEIF ----

#[test]
fn averageif_two_args_average_over_range_itself() {
    let (cm, vs) = make_multi_env();
    // B1:B5 = 10,20,30,40,50; criterion ">=30" → (30+40+50)/3 = 40.
    assert_eq!(
        eval_str("=AVERAGEIF(B1:B5,\">=30\")", &cm, &vs),
        Value::Number(40.0)
    );
}

#[test]
fn averageif_three_args_uses_average_range() {
    let (cm, vs) = make_multi_env();
    // Find rows where A is "apple" (rows 1, 5), average B → (10+50)/2 = 30.
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"apple\",B1:B5)", &cm, &vs),
        Value::Number(30.0)
    );
}

#[test]
fn averageif_wildcard_question_mark() {
    let (cm, vs) = make_multi_env();
    // `?pple` matches "apple" (rows 1 and 5), not "apricot". → (10+50)/2 = 30.
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"?pple\",B1:B5)", &cm, &vs),
        Value::Number(30.0)
    );
}

#[test]
fn averageif_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"apple\",B1:B5,\"extra\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn averageif_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    // A1:A5 is 5×1, B1:B3 is 3×1 → shape mismatch.
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"apple\",B1:B3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn averageif_empty_match_set_returns_div_zero() {
    let (cm, vs) = make_multi_env();
    // Nothing matches "zzz" → no numbers averaged → #DIV/0!.
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"zzz\",B1:B5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn averageif_skips_error_cells_in_the_criteria_range() {
    let (cm, vs) = make_multi_env();
    // Pre-populate A11 as an Error and leave B11 a plain number.
    let mut cm = cm;
    let mut vs = vs;
    let err_id = AtomId::from_raw(99);
    cm.insert(CellAddress::new(10, 0), err_id);
    cm.insert(CellAddress::new(10, 1), AtomId::from_raw(100));
    vs.insert(err_id, Value::Error(ValueError::WrongType));
    vs.insert(AtomId::from_raw(100), Value::Number(5.0));
    // 条件区里的错误格不满足 `"x"`，于是一行都没命中 → `#DIV/0!`，
    // 而**不是**把 `WrongType` 交回去。
    assert_eq!(
        eval_str("=AVERAGEIF(A11:A11,\"x\",B11:B11)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
