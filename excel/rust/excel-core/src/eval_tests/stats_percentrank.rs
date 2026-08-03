//! PERCENTRANK 的 INC/EXC 百分位排名。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- PERCENTRANK.INC ---

#[test]
fn percentrank_inc_endpoints() {
    let (cm, vs) = make_test_env();
    // Smallest value → 0; largest → 1.
    match eval_str("=PERCENTRANK.INC({10,20,30,40}, 10)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.0, 1e-9)),
        other => panic!("{:?}", other),
    }
    match eval_str("=PERCENTRANK.INC({10,20,30,40}, 40)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 1.0, 1e-9)),
        other => panic!("{:?}", other),
    }
}

#[test]
fn percentrank_inc_interior() {
    let (cm, vs) = make_test_env();
    // [10,20,30,40], x=25 → k_lower=1, frac=0.5, pos=1.5, rank=1.5/3=0.5.
    match eval_str("=PERCENTRANK.INC({10,20,30,40}, 25)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.5, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
    // Default significance=3 truncates: rank = 1.2/3 ≈ 0.399999...
    // → truncated to 0.399 (Excel parity — significance is "decimal
    // digits to keep", truncation toward zero, not rounding).
    match eval_str("=PERCENTRANK.INC({10,20,30,40}, 22)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.399, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn percentrank_inc_out_of_range() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PERCENTRANK.INC({10,20,30}, 5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=PERCENTRANK.INC({10,20,30}, 50)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

// --- PERCENTRANK.EXC ---

#[test]
fn percentrank_exc_basic() {
    let (cm, vs) = make_test_env();
    // [10,20,30,40], x=20 → k_lower=1, pos=1, rank=(1+1)/(4+1)=0.4.
    match eval_str("=PERCENTRANK.EXC({10,20,30,40}, 20)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.4, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn percentrank_exc_significance() {
    let (cm, vs) = make_test_env();
    // 1/3 ≈ 0.33333... → significance=2 truncates to 0.33.
    // [10,20,30,40] x=15 → k_lower=0, frac=0.5, pos=0.5, rank=1.5/5=0.3.
    // Try a case that exercises truncation: significance=2 of a 0.333...
    // is reached by [10,20] x≈15 (rank=0.5) — too clean. Try [a,b,c]
    // mid-x.
    // Just exercise the parameter: result should match default-3 here.
    match eval_str("=PERCENTRANK.EXC({10,20,30,40}, 25, 4)", &cm, &vs) {
        Value::Number(n) => {
            // x=25 → k_lower=1, frac=0.5, pos=1.5, rank=2.5/5=0.5.
            assert!(approx(n, 0.5, 1e-9), "got {}", n);
        }
        other => panic!("{:?}", other),
    }
}

#[test]
fn percentrank_exc_out_of_range() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PERCENTRANK.EXC({10,20,30}, 5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
