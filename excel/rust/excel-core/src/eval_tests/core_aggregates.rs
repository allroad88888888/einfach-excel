//! SUM/AVERAGE/COUNT/MIN/MAX/PRODUCT 等基础聚合。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_sum_cells() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SUM(A1,B1)", &cm, &vs), Value::Number(30.0));
}

#[test]
fn eval_sum_range() {
    let (cm, vs) = make_test_env();
    // SUM(A1:B1) = 10 + 20 = 30
    assert_eq!(eval_str("=SUM(A1:B1)", &cm, &vs), Value::Number(30.0));
}

#[test]
fn eval_average() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=AVERAGE(A1,B1)", &cm, &vs), Value::Number(15.0));
}

#[test]
fn eval_count() {
    let (cm, vs) = make_test_env();
    // COUNT(A1:B2) = A1(num), B1(num), A2(num), B2(text) → 3
    assert_eq!(eval_str("=COUNT(A1:B2)", &cm, &vs), Value::Number(3.0));
}

#[test]
fn eval_min() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=MIN(A1,B1,A2)", &cm, &vs), Value::Number(5.0));
}

#[test]
fn eval_max() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=MAX(A1,B1,A2)", &cm, &vs), Value::Number(20.0));
}

#[test]
fn eval_countif_sumif() {
    let (cm, vs) = make_test_env();
    // A1=10, B1=20, C1=0, A2=5, B2="text"
    // COUNTIF range A1:B1, value > 5 → A1=10, B1=20 → 2
    assert_eq!(
        eval_str("=COUNTIF(A1:B1,\">5\")", &cm, &vs),
        Value::Number(2.0)
    );
    // SUMIF: same range, > 5 → 10 + 20 = 30
    assert_eq!(
        eval_str("=SUMIF(A1:B1,\">5\")", &cm, &vs),
        Value::Number(30.0)
    );
}

#[test]
fn eval_large_small() {
    let (cm, vs) = make_test_env();
    // {10, 20, 5} → LARGE k=1 → 20, SMALL k=1 → 5
    assert_eq!(eval_str("=LARGE(A1:B2,1)", &cm, &vs), Value::Number(20.0));
    assert_eq!(eval_str("=SMALL(A1:B2,1)", &cm, &vs), Value::Number(5.0));
}

#[test]
fn eval_product() {
    let (cm, vs) = make_test_env();
    // A1=10, B1=20, A2=5 → 1000.
    assert_eq!(
        eval_str("=PRODUCT(A1,B1,A2)", &cm, &vs),
        Value::Number(1000.0)
    );
    // Range arg over A1:B1 → 200.
    assert_eq!(eval_str("=PRODUCT(A1:B1)", &cm, &vs), Value::Number(200.0));
    // Mixed range + scalar.
    assert_eq!(
        eval_str("=PRODUCT(A1:B1,A2)", &cm, &vs),
        Value::Number(1000.0)
    );
    // Text values are skipped (B2 is text); 10*20 = 200.
    assert_eq!(
        eval_str("=PRODUCT(A1,B1,B2)", &cm, &vs),
        Value::Number(200.0)
    );
    // No numeric args → 0 (Excel convention for PRODUCT).
    assert_eq!(eval_str("=PRODUCT(B2)", &cm, &vs), Value::Number(0.0));
    // Variadic accepts >= 0 args, but supplying nothing returns 0.
    assert_eq!(eval_str("=PRODUCT()", &cm, &vs), Value::Number(0.0));
    // Error propagation.
    assert_eq!(
        eval_str("=PRODUCT(A1,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_counta() {
    let (cm, vs) = make_test_env();
    // A1, B1, A2, B2 are all present in A1:B2 (C1 outside the range).
    assert_eq!(eval_str("=COUNTA(A1:B2)", &cm, &vs), Value::Number(4.0));
    // Scalar args: 3 args yield 3.
    assert_eq!(eval_str("=COUNTA(1,2,3)", &cm, &vs), Value::Number(3.0));
    // Mix range + scalar (A1:B1 = 2 cells, +A2 = 3).
    assert_eq!(eval_str("=COUNTA(A1:B1,A2)", &cm, &vs), Value::Number(3.0));
    // Text and booleans count.
    assert_eq!(
        eval_str("=COUNTA(B2,TRUE,\"x\")", &cm, &vs),
        Value::Number(3.0)
    );
    // No args → 0.
    assert_eq!(eval_str("=COUNTA()", &cm, &vs), Value::Number(0.0));
    // Per spec: COUNTA counts errors too — they're "not blank".
    assert_eq!(eval_str("=COUNTA(A1/C1,A1)", &cm, &vs), Value::Number(2.0));
}

#[test]
fn eval_countblank() {
    let (cm, vs) = make_test_env();
    // A1:B2 has 4 populated cells; no Null hits.
    assert_eq!(eval_str("=COUNTBLANK(A1:B2)", &cm, &vs), Value::Number(0.0));
    // A range with two missing cells (C2 and C3 are not in cell_map).
    assert_eq!(eval_str("=COUNTBLANK(C2:C3)", &cm, &vs), Value::Number(2.0));
    // WrongArgCount.
    assert_eq!(
        eval_str("=COUNTBLANK(A1:B1,C1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COUNTBLANK()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation through a sub-expression — error is not Null.
    assert_eq!(eval_str("=COUNTBLANK(A1/C1)", &cm, &vs), Value::Number(0.0));
    // 1×1 区域里的空格也是一格（B7 不在 cell_map 里）。
    assert_eq!(eval_str("=COUNTBLANK(B7)", &cm, &vs), Value::Number(1.0));
    // 空文本 `""` 算空、`0` 不算空 —— Excel 实测口径（微软文档原文：「Cells with
    // formulas that return "" (empty text) are also counted. Cells with zero
    // values are not counted.」）。**注意**：Excel 的 COUNTBLANK 只收引用，数组
    // 常量在它那里是**解析期就被拒**的；本引擎宽容地接受，这里只是借数组形态
    // 把「什么算空」这条判据钉住。真实区域上的同一条判据见
    // `tests/sparse_range_blank_cardinality.rs`（稠密 provider 抓不住整列口径）。
    assert_eq!(eval_str("=COUNTBLANK({1,\"\",3})", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=COUNTBLANK({1,0,3})", &cm, &vs), Value::Number(0.0));
    // 同一个 `""` 格 COUNTA 算非空 → COUNTBLANK **不是** COUNTA 的补集。
    assert_eq!(eval_str("=COUNTA({1,\"\",3})", &cm, &vs), Value::Number(3.0));
}
