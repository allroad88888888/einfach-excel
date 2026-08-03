//! *IFS 家族对 criteria 区间内错误单元格的统一处理。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

#[test]
fn ifs_family_skips_criteria_range_errors() {
    let (cm, vs) = make_criteria_error_env();
    // 条件区里的错误格只是「不满足条件」。单条件版一直是这么做的，多条件版
    // 必须给出同一个答案 —— 两者本是同一套 criteria 语义（Excel 里
    // `=COUNTIFS(rng,"<>#N/A",rng,"<>#VALUE!")` 在含错误的区域上照样回一个
    // 计数，而不是把错误交回去）。
    let two = Value::Number(2.0);
    assert_eq!(eval_str("=COUNTIF(A1:A4,\">3\")", &cm, &vs), two);
    assert_eq!(eval_str("=COUNTIFS(A1:A4,\">3\")", &cm, &vs), two);
    let fifty = Value::Number(50.0);
    assert_eq!(eval_str("=SUMIF(A1:A4,\">3\",B1:B4)", &cm, &vs), fifty);
    assert_eq!(eval_str("=SUMIFS(B1:B4,A1:A4,\">3\")", &cm, &vs), fifty);
    let twenty_five = Value::Number(25.0);
    assert_eq!(eval_str("=AVERAGEIF(A1:A4,\">3\",B1:B4)", &cm, &vs), twenty_five);
    assert_eq!(eval_str("=AVERAGEIFS(B1:B4,A1:A4,\">3\")", &cm, &vs), twenty_five);
    assert_eq!(eval_str("=MAXIFS(B1:B4,A1:A4,\">3\")", &cm, &vs), Value::Number(30.0));
    assert_eq!(eval_str("=MINIFS(B1:B4,A1:A4,\">3\")", &cm, &vs), Value::Number(20.0));
}

#[test]
fn ifs_family_still_propagates_value_range_errors() {
    let (cm, vs) = make_criteria_error_env();
    // `"<5"` 命中第 1 行，而那一行的值区 `B1` 是错误 —— 值档照旧传播，
    // 跟 `SUM` 一样。这是上一条的对照：只跳条件区，不是「到处不传播」。
    let div0 = Value::Error(ValueError::DivisionByZero);
    assert_eq!(eval_str("=SUMIF(A1:A4,\"<5\",B1:B4)", &cm, &vs), div0);
    assert_eq!(eval_str("=SUMIFS(B1:B4,A1:A4,\"<5\")", &cm, &vs), div0);
    assert_eq!(eval_str("=AVERAGEIF(A1:A4,\"<5\",B1:B4)", &cm, &vs), div0);
    assert_eq!(eval_str("=AVERAGEIFS(B1:B4,A1:A4,\"<5\")", &cm, &vs), div0);
    assert_eq!(eval_str("=MAXIFS(B1:B4,A1:A4,\"<5\")", &cm, &vs), div0);
    assert_eq!(eval_str("=MINIFS(B1:B4,A1:A4,\"<5\")", &cm, &vs), div0);
}
