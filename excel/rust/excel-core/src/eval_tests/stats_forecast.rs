//! FORECAST/TREND/GROWTH 的趋势外推。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_forecast_predicts_on_perfect_line() {
    let (cm, vs) = make_math_env();
    // y = 2x → at x=10, y=20.
    assert_eq!(
        eval_str("=FORECAST(10, B1:B5, A1:A5)", &cm, &vs),
        Value::Number(20.0)
    );
}

#[test]
fn eval_forecast_linear_alias() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=FORECAST.LINEAR(10, B1:B5, A1:A5)", &cm, &vs),
        Value::Number(20.0)
    );
}

#[test]
fn eval_trend_predicts_at_training_points() {
    let (cm, vs) = make_math_env();
    match eval_str("=TREND(B1:B5, A1:A5)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (5, 1));
            if let Some(Value::Number(n)) = arr.get(0, 0) {
                assert!((n - 2.0).abs() < 1e-9);
            }
            if let Some(Value::Number(n)) = arr.get(4, 0) {
                assert!((n - 10.0).abs() < 1e-9);
            }
        }
        other => panic!("expected 5x1 Array, got {:?}", other),
    }
}

#[test]
fn eval_growth_recovers_exponential_at_training_points() {
    // y = 2^x at x = 1..4.
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let mut next = 0u64;
    for (i, (x, y)) in [(1.0, 2.0), (2.0, 4.0), (3.0, 8.0), (4.0, 16.0)]
        .iter()
        .enumerate()
    {
        let xa = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(i as u32, 0), xa);
        vs.insert(xa, Value::Number(*x));
        let ya = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(i as u32, 1), ya);
        vs.insert(ya, Value::Number(*y));
    }
    match eval_str("=GROWTH(B1:B4, A1:A4)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (4, 1));
            if let Some(Value::Number(n)) = arr.get(3, 0) {
                assert!((n - 16.0).abs() < 1e-7);
            }
        }
        other => panic!("expected Array, got {:?}", other),
    }
}
