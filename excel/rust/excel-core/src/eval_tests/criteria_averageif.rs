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

/// average_range 与 SUMIF 的 sum_range 同一条规则：**只取左上角**，行列数由
/// 条件区决定。写短、写长、写成一格都不是错误。
///
/// 这条曾经是 `averageif_shape_mismatch`，钉的是「A1:A5 配 B1:B3 → `#VALUE!`」
/// —— 那是本仓自己加的守卫，不是 Excel 的规则（微软 SUMIF 文档：
/// "…using the upper leftmost cell in the sum_range argument as the beginning
/// cell, and then including cells that correspond in size and shape to the
/// range argument"，AVERAGEIF 的 average_range 同款措辞）。紧邻的 `fn_sumif`
/// 一直是对的，家族内部不自洽。任务 #103(a)。
#[test]
fn averageif_value_range_is_resized_to_the_criteria_shape() {
    let (cm, vs) = make_multi_env();
    // A1:A5 是 5×1；"apple" 命中第 1、5 行 ⇒ B1=10 与 B5=50 ⇒ 30。
    // 值区无论写成 B1:B3（短）、B1（一格）还是 B1:B9（长），矩形都是 B1:B5。
    for value_arg in ["B1:B3", "B1", "B1:B9", "B1:B5"] {
        assert_eq!(
            eval_str(
                &format!("=AVERAGEIF(A1:A5,\"apple\",{value_arg})"),
                &cm,
                &vs
            ),
            Value::Number(30.0),
            "average_range = {value_arg}"
        );
    }
    // 锚点下移一行 ⇒ B2:B6，命中 B2=20 与 B6=空。空格不进分母 ⇒ 20/1。
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"apple\",B2)", &cm, &vs),
        Value::Number(20.0)
    );
}

/// 矩形越过网格下边界 → `#REF!`。没有这道闸，越界的那几格会静悄悄读成空格，
/// `SUMIF` 答 0 而 TS 参考引擎答 `#REF!`（`criteriaValueRect` 返回 `undefined`）。
/// SUMIF / AVERAGEIF 共用 `value_rect_fits`，所以两个一起钉。
#[test]
fn criteria_value_rect_past_the_grid_is_ref_error() {
    let (cm, vs) = make_multi_env();
    // A1:A5 是 5 行，锚点 B1048573 要读到 B1048577 —— 网格只有 1048576 行。
    for formula in [
        "=AVERAGEIF(A1:A5,\"apple\",B1048573)",
        "=SUMIF(A1:A5,\"apple\",B1048573)",
    ] {
        assert_eq!(
            eval_str(formula, &cm, &vs),
            Value::Error(ValueError::InvalidRef),
            "{formula}"
        );
    }
    // 差一行就放得下（B1048572:B1048576，最后一行正好是网格的最后一行）：闸门
    // 卡在正确的位置上，而不是「凡是大行号一律 #REF!」。那片格子全空 ⇒
    // SUMIF 加 0、AVERAGEIF 一个数都没有。
    assert_eq!(
        eval_str("=SUMIF(A1:A5,\"apple\",B1048572)", &cm, &vs),
        Value::Number(0.0)
    );
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A5,\"apple\",B1048572)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
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

/// 分母口径：average_range 里**只有真正的数字**进分母。
///
/// 这条在 Rust 侧一直是对的（`average_over` 用 `number_only`），钉住是因为跨引擎
/// 那张网此前没覆盖它、而 TS 参考引擎在这一格上是错的（用 SUMIF 那档
/// `toNumber`，空格 → 0）。任务 #103(b)/(c) 的 Rust 侧围栏。
///
/// `A1=1 / A2 空 / A3=3`、`B1=10 / B2 空 / B3=30`（条件区与值区的洞同位）；
/// `C1:C3=1,2,3` 配 `D1=10 / D2 空 / D3=30`（洞只在值区）；
/// `E1:E3=1,2,3` 配 `F1=10 / F2=TRUE / F3=30`（值区那一格是布尔）。
#[test]
fn averageif_denominator_counts_numbers_only() {
    let (cm, vs) = make_blank_env();
    // 洞只在值区：命中三格、只有两个数 ⇒ 20，不是 (10+0+30)/3。
    assert_eq!(
        eval_str("=AVERAGEIF(C1:C3,\">0\",D1:D3)", &cm, &vs),
        Value::Number(20.0)
    );
    assert_eq!(
        eval_str("=AVERAGEIFS(D1:D3,C1:C3,\">0\")", &cm, &vs),
        Value::Number(20.0)
    );
    // 布尔与空格同档，`AVERAGE` 也是这条规则 —— 两行摆一起，任何一侧单独漂移
    // 都看得见。
    assert_eq!(
        eval_str("=AVERAGEIF(E1:E3,\">0\",F1:F3)", &cm, &vs),
        Value::Number(20.0)
    );
    assert_eq!(eval_str("=AVERAGE(F1:F3)", &cm, &vs), Value::Number(20.0));
    // 判据认空格、且另有数字命中：空格那一格不进分母 ⇒ (10+30)/2。
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A3,\"<>x\",B1:B3)", &cm, &vs),
        Value::Number(20.0)
    );
    // 反向围栏：SUMIF 那一档**不**跟着改，空格照旧当 0 加（对和无害）。
    assert_eq!(
        eval_str("=SUMIF(A1:A3,\"<>x\",B1:B3)", &cm, &vs),
        Value::Number(40.0)
    );
}

/// `AVERAGEIF(区域,"")`：唯一命中的位置在值区侧是空格 ⇒ 一个数都没有 ⇒
/// `#DIV/0!`，不是 0。上一条的极端症状，不是独立缺陷。
#[test]
fn averageif_blank_criterion_hitting_only_blanks_is_div_zero() {
    let (cm, vs) = make_blank_env();
    for formula in [
        "=AVERAGEIF(A1:A3,\"\")",
        "=AVERAGEIF(A1:A3,\"\",B1:B3)",
    ] {
        assert_eq!(
            eval_str(formula, &cm, &vs),
            Value::Error(ValueError::DivisionByZero),
            "{formula}"
        );
    }
    // 反向围栏：同一条判据，值区那一格**有数**时照常给数 —— 「空判据一律
    // #DIV/0!」是错的修法，这一行会把它抓住。C2 非空，用 D 列做值区读到 D2 空；
    // 换成 F 列（F2=TRUE 也不是数）仍是 #DIV/0!，所以另建一格实打实的数：
    assert_eq!(
        eval_str("=AVERAGEIF(A1:A3,\"\",C1:C3)", &cm, &vs),
        Value::Number(2.0)
    );
    // 计数那一档照旧把空格数进去 —— 分母口径不许外溢到 COUNTIF。
    assert_eq!(
        eval_str("=COUNTIF(A1:A3,\"\")", &cm, &vs),
        Value::Number(1.0)
    );
}

/// `A1=1 / A2 空 / A3=3`；`B1=10 / B2 空 / B3=30`；`C1:C3=1,2,3`；
/// `D1=10 / D2 空 / D3=30`；`E1:E3=1,2,3`；`F1=10 / F2=TRUE / F3=30`。
fn make_blank_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (row, col, id, v) in [
        (0u32, 0u32, 0u64, 1.0),
        (2, 0, 1, 3.0),
        (0, 1, 2, 10.0),
        (2, 1, 3, 30.0),
        (0, 2, 4, 1.0),
        (1, 2, 5, 2.0),
        (2, 2, 6, 3.0),
        (0, 3, 7, 10.0),
        (2, 3, 8, 30.0),
        (0, 4, 9, 1.0),
        (1, 4, 10, 2.0),
        (2, 4, 11, 3.0),
        (0, 5, 12, 10.0),
        (2, 5, 13, 30.0),
    ] {
        let a = AtomId::from_raw(id);
        cm.insert(CellAddress::new(row, col), a);
        vs.insert(a, Value::Number(v));
    }
    let b = AtomId::from_raw(14);
    cm.insert(CellAddress::new(1, 5), b);
    vs.insert(b, Value::Boolean(true));
    (cm, vs)
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
