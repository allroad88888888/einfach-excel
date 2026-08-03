//! RANK 及 RANK.EQ/RANK.AVG 的名次计算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use crate::formula::parse_formula;

// --- RANK / RANKEQ ---

#[test]
fn eval_rank_desc_default() {
    let (cm, vs) = make_stat_env();
    // A1..A5 = 2,4,6,8,10. RANK(6, A1:A5) desc → 2 values > 6 (8,10) → rank 3.
    assert_eq!(eval_str("=RANK(6,A1:A5)", &cm, &vs), Value::Number(3.0));
    // RANKEQ is an alias.
    assert_eq!(eval_str("=RANKEQ(6,A1:A5)", &cm, &vs), Value::Number(3.0));
}

#[test]
fn eval_rank_asc_order() {
    let (cm, vs) = make_stat_env();
    // RANK(6, A1:A5, 1) asc → 2 values < 6 (2,4) → rank 3.
    assert_eq!(eval_str("=RANK(6,A1:A5,1)", &cm, &vs), Value::Number(3.0));
}

#[test]
fn eval_rank_missing_value() {
    let (cm, vs) = make_stat_env();
    // 7 is not in A1:A5 → #VALUE!.
    assert_eq!(
        eval_str("=RANK(7,A1:A5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_rank_ties_same_low_rank() {
    let (cm, vs) = make_stat_env();
    // E1..E3 = 10,10,5. RANK(10, E1:E3) desc → 0 values > 10 → rank 1
    // for both ties (RANK / RANK.EQ behavior).
    assert_eq!(eval_str("=RANK(10,E1:E3)", &cm, &vs), Value::Number(1.0));
}

#[test]
fn eval_rank_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANK(6)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=RANK(6,A1:A5,1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_rank_type_error() {
    let (cm, vs) = make_stat_env();
    // First arg is text → WrongType.
    assert_eq!(
        eval_str("=RANK(\"abc\",A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_rank_error_propagates() {
    let (cm, vs) = make_stat_env();
    // Numerator A1, denominator Z1=0 (Null→0). First arg errors.
    assert_eq!(
        eval_str("=RANK(A1/Z1,A1:A5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- RANKEQ (explicit) ---

#[test]
fn eval_rankeq_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANKEQ()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_rankeq_type_error() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANKEQ(\"x\",A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

// --- RANKAVG ---

#[test]
fn eval_rankavg_ties_average() {
    let (cm, vs) = make_stat_env();
    // E1..E3 = 10,10,5 desc → ranks of two 10s would be 1 and 2 → average 1.5.
    assert_eq!(eval_str("=RANKAVG(10,E1:E3)", &cm, &vs), Value::Number(1.5));
    // Lone 5 → rank 3 (only 2 values strictly greater).
    assert_eq!(eval_str("=RANKAVG(5,E1:E3)", &cm, &vs), Value::Number(3.0));
}

#[test]
fn eval_rankavg_happy_no_ties() {
    let (cm, vs) = make_stat_env();
    // No ties, behaves like RANK.
    assert_eq!(eval_str("=RANKAVG(6,A1:A5)", &cm, &vs), Value::Number(3.0));
}

#[test]
fn eval_rankavg_missing_value() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANKAVG(7,A1:A5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_rankavg_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANKAVG(6)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_rankavg_type_error() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=RANKAVG(\"x\",A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_rankavg_dotted_name_parses() {
    // The parser accepts `.` inside function identifiers (Excel 2010+
    // dotted aliases). RANK.AVG / RANK.EQ now parse as their own
    // FuncCall names and route through the corresponding dispatcher
    // arms; semantics are validated by `eval_rank_eq_dotted` /
    // `eval_rank_avg_dotted`.
    assert!(parse_formula("=RANK.AVG(1,A1:A3)").is_some());
    assert!(parse_formula("=RANK.EQ(1,A1:A3)").is_some());
}

// ============================================================
// Excel 2010+ dotted-name aliases & variants.
//
// Parser support (`.` allowed inside identifiers) is verified in
// `formula::identifier::tests`; here we pin the dispatcher arms.
// ============================================================

// --- Pure aliases — RANK.EQ / RANK.AVG / PERCENTILE.INC / QUARTILE.INC ---

#[test]
fn eval_rank_eq_dotted() {
    let (cm, vs) = make_stat_env();
    // RANK.EQ(6, A1:A5) desc → 2 values > 6 → rank 3. Must match the
    // bare RANK / RANKEQ arms exactly.
    assert_eq!(eval_str("=RANK.EQ(6,A1:A5)", &cm, &vs), Value::Number(3.0));
    assert_eq!(
        eval_str("=RANK.EQ(6,A1:A5)", &cm, &vs),
        eval_str("=RANK(6,A1:A5)", &cm, &vs),
    );
    // Arg-count error path is shared with RANK.
    assert_eq!(
        eval_str("=RANK.EQ(6)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_rank_avg_dotted() {
    let (cm, vs) = make_stat_env();
    // E1..E3 = 10, 10, 5 — ties at 10 → average(1, 2) = 1.5.
    assert_eq!(
        eval_str("=RANK.AVG(10,E1:E3)", &cm, &vs),
        Value::Number(1.5),
    );
    assert_eq!(
        eval_str("=RANK.AVG(10,E1:E3)", &cm, &vs),
        eval_str("=RANKAVG(10,E1:E3)", &cm, &vs),
    );
    assert_eq!(
        eval_str("=RANK.AVG(10)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}
