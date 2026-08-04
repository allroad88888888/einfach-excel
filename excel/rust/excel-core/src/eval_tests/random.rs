//! RAND/RANDBETWEEN 的取值范围。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Q batch tests: random / ranking / percentile / mode / A-variants / stats ===

// --- RAND ---

#[test]
fn rand_in_unit_interval() {
    let (cm, vs) = make_test_env();
    for _ in 0..1000 {
        match eval_str("=RAND()", &cm, &vs) {
            Value::Number(n) => {
                assert!((0.0..1.0).contains(&n), "RAND draw out of [0,1): {}", n);
            }
            other => panic!("RAND should return Number, got {:?}", other),
        }
    }
}

#[test]
fn rand_two_calls_differ() {
    // Statistically RAND() collisions across 100 paired draws should be
    // vanishingly rare; we only assert "at least one pair differs",
    // which has effective probability 1 for any non-trivial RNG.
    let (cm, vs) = make_test_env();
    let mut any_diff = false;
    for _ in 0..100 {
        let a = eval_str("=RAND()", &cm, &vs);
        let b = eval_str("=RAND()", &cm, &vs);
        if a != b {
            any_diff = true;
            break;
        }
    }
    assert!(
        any_diff,
        "RAND produced identical values across 100 paired draws"
    );
}

#[test]
fn rand_rejects_args() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=RAND(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

// --- RANDBETWEEN ---

#[test]
fn randbetween_inclusive_bounds() {
    let (cm, vs) = make_test_env();
    for _ in 0..500 {
        match eval_str("=RANDBETWEEN(1, 6)", &cm, &vs) {
            Value::Number(n) => {
                assert!(n.fract() == 0.0, "RANDBETWEEN should produce integer");
                let i = n as i64;
                assert!((1..=6).contains(&i), "RANDBETWEEN out of range: {}", i);
            }
            other => panic!("RANDBETWEEN -> {:?}", other),
        }
    }
}

#[test]
fn randbetween_single_point() {
    // low == high → always returns that value.
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=RANDBETWEEN(7, 7)", &cm, &vs), Value::Number(7.0));
    assert_eq!(
        eval_str("=RANDBETWEEN(-3, -3)", &cm, &vs),
        Value::Number(-3.0)
    );
}

#[test]
fn randbetween_low_gt_high_is_num() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=RANDBETWEEN(10, 5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
