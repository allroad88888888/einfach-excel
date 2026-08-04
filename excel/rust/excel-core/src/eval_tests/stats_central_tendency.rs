//! AVERAGEA/MODE/MAXA/MINA/GEOMEAN/HARMEAN/TRIMMEAN 的集中趋势。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- AVERAGEA ---

#[test]
fn eval_averagea_happy_path() {
    let (cm, vs) = make_stat_env();
    // D1=TRUE(1) + D2=FALSE(0) + D3="hello"(0) + D4=Null(skip) + D5=5(5)
    // → total = 6, count = 4 → 1.5.
    assert_eq!(eval_str("=AVERAGEA(D1:D5)", &cm, &vs), Value::Number(1.5));
    // Numbers only: A1..A5 = 2,4,6,8,10 → mean 6.
    assert_eq!(eval_str("=AVERAGEA(A1:A5)", &cm, &vs), Value::Number(6.0));
}

#[test]
fn eval_averagea_empty_is_div_zero() {
    let (cm, vs) = make_stat_env();
    // Empty (no args) → WrongArgCount? No — variadic, but no values → DivisionByZero.
    // We use a range pointing at an empty area.
    assert_eq!(
        eval_str("=AVERAGEA(Z1:Z5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_averagea_error_propagates() {
    let (cm, vs) = make_stat_env();
    // A1/Z1 → A1=2, Z1=0 (Null coerces to 0) → DivisionByZero.
    assert_eq!(
        eval_str("=AVERAGEA(A1/Z1,A2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_geomean_simple() {
    // geomean(2, 8) = sqrt(16) = 4.
    assert_approx_eq(ev("=GEOMEAN(2, 8)"), 4.0, TOL);
}

#[test]
fn eval_geomean_negative_is_error() {
    assert_eq!(ev("=GEOMEAN(1, -1, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_geomean_zero_is_error() {
    assert_eq!(ev("=GEOMEAN(1, 0, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_harmean_simple() {
    // harmean(1, 2, 4) = 3 / (1 + 0.5 + 0.25) = 3 / 1.75 ≈ 1.714286.
    assert_approx_eq(ev("=HARMEAN(1, 2, 4)"), 3.0 / 1.75, TOL);
}

#[test]
fn eval_harmean_negative_is_error() {
    assert_eq!(ev("=HARMEAN(1, -1, 2)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_trimmean_no_trim() {
    // n=10, percent=0.1 → trim_total=1 → trim_each=0. Mean of all = 5.5.
    // SEQUENCE(10) produces 1..=10 as a 10x1 spill array which TRIMMEAN
    // consumes as its first arg.
    assert_approx_eq(ev("=TRIMMEAN(SEQUENCE(10), 0.1)"), 5.5, TOL);
}

#[test]
fn eval_trimmean_with_trim() {
    // n=10, percent=0.2 → trim_total=2 → trim_each=1. Mean of 2..9 = 5.5.
    assert_approx_eq(ev("=TRIMMEAN(SEQUENCE(10), 0.2)"), 5.5, TOL);
}

#[test]
fn eval_trimmean_percent_out_of_range() {
    assert_eq!(
        ev("=TRIMMEAN(SEQUENCE(3), 1)"),
        Value::Error(ValueError::Overflow)
    );
}

// --- MODE 的并列打破 ---

/// 并列众数必须取**首次出现**的那个，而且必须是**确定的**。
///
/// 坏实现是 `counts.iter().max_by_key(..)` —— 遍历的是 `HashMap`，顺序不确定，
/// 于是并列的打破是随机的。单跑一次的断言在坏实现上有约 `1/并列宽度` 的概率
/// 蒙对，绿灯说明不了任何事，所以这里跑 N 次并要求**每次都等于**首次出现的值。
///
/// 为什么同一进程内重复调用就够（不用靠重启进程换种子）：`std` 的 `RandomState`
/// 只在每个线程首次使用时向 OS 要一次种子，之后**每 new 一个 `HashMap` 就换一次
/// 哈希键**。实测同一进程内连造 12 个 4 键 `HashMap`，拿到 9 种不同的迭代顺序；
/// 未修版本的 `=MODE(A1:A4)`（3,1,1,3）单进程连跑 20 次，答案在 3 和 1 之间
/// 来回跳（9 次 3 / 11 次 1）。而 `MODE` 每次调用都新建一个 `counts` 映射，
/// 所以每次 `eval_str` 就是一次独立抽样。
///
/// N 与并列宽度：2 路并列坏实现每次约 1/2 蒙对，4 路约 1/4（`max_by_key` 取
/// 迭代序里**最后**一个最大值）。取 N = 64，坏实现全程蒙对的概率 ≤ 2⁻⁶⁴。
#[test]
fn mode_tie_break_is_first_occurrence_and_deterministic() {
    let (cm, vs) = make_test_env();
    const N: usize = 64;

    // 2 路并列：3 与 1 各出现两次，3 先出现 → 3。
    for i in 0..N {
        assert_eq!(
            eval_str("=MODE({3,1,1,3})", &cm, &vs),
            Value::Number(3.0),
            "第 {i} 次：并列众数必须恒定取首次出现的 3"
        );
    }

    // 4 路并列：2/9/5/7 各出现两次，2 先出现 → 2。
    for i in 0..N {
        assert_eq!(
            eval_str("=MODE({2,9,5,7,2,9,5,7})", &cm, &vs),
            Value::Number(2.0),
            "第 {i} 次：4 路并列同样恒定取首次出现的 2"
        );
    }

    // MODE 与 MODE.MULT 的首元素必须是同一个值 —— 两边共用「首次出现」这条扫描。
    for i in 0..N {
        let (_, _, data) = unwrap_array(eval_str("=MODE.MULT({3,1,1,3})", &cm, &vs));
        assert_eq!(
            data.first(),
            Some(&Value::Number(3.0)),
            "第 {i} 次：MODE.MULT 的首元素必须与 MODE 一致"
        );
    }
}

// --- MODE.SNGL / MODE.MULT ---

#[test]
fn mode_sngl_routes_to_mode() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=MODE.SNGL(1, 2, 2, 3)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn mode_mult_returns_all_modes() {
    let (cm, vs) = make_test_env();
    // 2 and 3 both appear twice → both modes.
    let (r, c, data) = unwrap_array(eval_str("=MODE.MULT({1,2,2,3,3,4})", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    // First-occurrence order: 2 appears before 3 in input.
    assert_eq!(data, vec![Value::Number(2.0), Value::Number(3.0)]);
}

#[test]
fn mode_mult_no_repeats_is_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=MODE.MULT({1,2,3,4})", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

// --- MAXA / MINA ---

#[test]
fn maxa_treats_logical_as_one_zero() {
    let (cm, vs) = make_test_env();
    // TRUE = 1, FALSE = 0; -1 < 0 so the TRUE wins.
    assert_eq!(
        eval_str("=MAXA(-1, FALSE, TRUE)", &cm, &vs),
        Value::Number(1.0)
    );
}

#[test]
fn mina_treats_text_as_zero() {
    let (cm, vs) = make_test_env();
    // 5 is the smallest non-text candidate; "hello" counts as 0 → 0 wins.
    assert_eq!(
        eval_str(r#"=MINA(5, 10, "hello")"#, &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn maxa_empty_returns_zero() {
    let (cm, vs) = make_test_env();
    // C1 is 0 in the test env, but a fully-empty range goes to 0.
    // Use a literal of no args to trip the empty path (Excel returns 0).
    // We can synthesize via an unused range; in our env C2 is empty.
    // MAX(C2) → InvalidValue (existing), MAXA(C2) → 0 (Excel parity).
    // The empty-input path is hard to hit purely with literals; use a
    // single empty arg through Null coercion (literal "")=text counts
    // as 0, so check that path too.
    assert_eq!(eval_str(r#"=MAXA("")"#, &cm, &vs), Value::Number(0.0));
}
