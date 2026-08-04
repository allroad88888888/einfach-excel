//! FREQUENCY 的分桶计数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- FREQUENCY ---

#[test]
fn frequency_basic_buckets() {
    let (cm, vs) = make_test_env();
    // data={1,2,3,4,5}, bins={2,4} → buckets are (-∞,2], (2,4], (4,∞).
    // bucket[0]: 1,2 → 2; bucket[1]: 3,4 → 2; bucket[2]: 5 → 1.
    let (r, c, data) = unwrap_array(eval_str("=FREQUENCY({1,2,3,4,5}, {2,4})", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(2.0), Value::Number(2.0), Value::Number(1.0)]
    );
}

#[test]
fn frequency_tie_lands_in_lower_bucket() {
    let (cm, vs) = make_test_env();
    // x = 5 with bins {5, 10} → 5 goes into bucket 0 (≤5), not bucket 1.
    let (_, _, data) = unwrap_array(eval_str("=FREQUENCY({5,5}, {5,10})", &cm, &vs));
    assert_eq!(
        data,
        vec![Value::Number(2.0), Value::Number(0.0), Value::Number(0.0)]
    );
}

#[test]
fn frequency_overflow_bucket() {
    let (cm, vs) = make_test_env();
    // A value above every bin lands in the overflow bucket at the end.
    let (rr, cc, dd) = unwrap_array(eval_str("=FREQUENCY({100}, {1,2,3})", &cm, &vs));
    assert_eq!((rr, cc), (4, 1));
    assert_eq!(
        dd,
        vec![
            Value::Number(0.0),
            Value::Number(0.0),
            Value::Number(0.0),
            Value::Number(1.0)
        ]
    );
}

#[test]
fn frequency_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=FREQUENCY({1,2,3})", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
