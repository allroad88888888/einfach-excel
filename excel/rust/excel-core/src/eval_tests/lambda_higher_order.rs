//! MAP/REDUCE/SCAN/BYROW/BYCOL/MAKEARRAY 的高阶回调。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ── MAP / REDUCE / SCAN (Part B) ──────────────────────────────────

/// `=MAP(SEQUENCE(5), LAMBDA(x, x*2))` → [2, 4, 6, 8, 10] (5×1).
#[test]
fn eval_map_unary_doubles() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=MAP(SEQUENCE(5), LAMBDA(x, x*2))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (5, 1));
            let expected = [2.0, 4.0, 6.0, 8.0, 10.0];
            for (i, e) in expected.iter().enumerate() {
                assert_eq!(arr.get(i as u32, 0), Some(&Value::Number(*e)));
            }
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

/// `=MAP(SEQUENCE(3), SEQUENCE(3), LAMBDA(a,b, a+b))` → [2, 4, 6].
/// The two arrays must share shape; lambda receives one value from
/// each per cell.
#[test]
fn eval_map_binary_zip() {
    let (cm, vs) = make_test_env();
    let v = eval_str(
        "=MAP(SEQUENCE(3), SEQUENCE(3), LAMBDA(a, b, a+b))",
        &cm,
        &vs,
    );
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (3, 1));
            let expected = [2.0, 4.0, 6.0];
            for (i, e) in expected.iter().enumerate() {
                assert_eq!(arr.get(i as u32, 0), Some(&Value::Number(*e)));
            }
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

/// Lambda arity != number of input arrays → WrongArgCount.
#[test]
fn eval_map_lambda_arity_mismatch() {
    let (cm, vs) = make_test_env();
    // 2 arrays + 1-param lambda — should fail early before any
    // element gets evaluated.
    assert_eq!(
        eval_str("=MAP(SEQUENCE(2), SEQUENCE(2), LAMBDA(x, x*2))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// Shape mismatch between input arrays → WrongType.
#[test]
fn eval_map_shape_mismatch() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(3) is 3×1; SEQUENCE(5) is 5×1.
    assert_eq!(
        eval_str(
            "=MAP(SEQUENCE(3), SEQUENCE(5), LAMBDA(a, b, a+b))",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

/// REDUCE walks the array, returning the final accumulator.
/// `=REDUCE(0, SEQUENCE(5), LAMBDA(acc, x, acc+x))` → 15.
#[test]
fn eval_reduce_sum() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=REDUCE(0, SEQUENCE(5), LAMBDA(acc, x, acc+x))", &cm, &vs),
        Value::Number(15.0)
    );
}

/// REDUCE result is scalar, not Array (the L2/L3 contract).
#[test]
fn eval_reduce_returns_scalar_not_array() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=REDUCE(10, SEQUENCE(3), LAMBDA(a, x, a*x))", &cm, &vs);
    assert!(matches!(v, Value::Number(_)));
    assert_eq!(v, Value::Number(60.0));
}

/// SCAN emits the intermediate accumulators. With initial=0, body=
/// `acc+x`, over [1,2,3,4,5]: [1, 3, 6, 10, 15] as 5×1.
#[test]
fn eval_scan_cumulative_sum() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=SCAN(0, SEQUENCE(5), LAMBDA(acc, x, acc+x))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (5, 1));
            let expected = [1.0, 3.0, 6.0, 10.0, 15.0];
            for (i, e) in expected.iter().enumerate() {
                assert_eq!(arr.get(i as u32, 0), Some(&Value::Number(*e)));
            }
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

#[test]
fn eval_higher_order_array_callbacks_keep_scalar_errors() {
    let (cm, vs) = make_test_env();

    let mapped = eval_str("=MAP({1,-1}, LAMBDA(x, SQRT(x)))", &cm, &vs);
    match mapped {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Error(ValueError::Overflow)));
        }
        _ => panic!("expected Array, got {:?}", mapped),
    }

    let scanned = eval_str("=SCAN(0, {1,-1}, LAMBDA(acc, x, SQRT(x)))", &cm, &vs);
    match scanned {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Error(ValueError::Overflow)));
        }
        _ => panic!("expected Array, got {:?}", scanned),
    }

    let byrow = eval_str("=BYROW({-1;4}, LAMBDA(r, SQRT(SUM(r))))", &cm, &vs);
    match byrow {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 1));
            assert_eq!(arr.get(0, 0), Some(&Value::Error(ValueError::Overflow)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(2.0)));
        }
        _ => panic!("expected Array, got {:?}", byrow),
    }

    let bycol = eval_str("=BYCOL({-1,4}, LAMBDA(c, SQRT(SUM(c))))", &cm, &vs);
    match bycol {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Error(ValueError::Overflow)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(2.0)));
        }
        _ => panic!("expected Array, got {:?}", bycol),
    }

    let made = eval_str("=MAKEARRAY(1,2,LAMBDA(r,c,SQRT(c-2)))", &cm, &vs);
    match made {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Error(ValueError::Overflow)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(0.0)));
        }
        _ => panic!("expected Array, got {:?}", made),
    }
}

#[test]
fn eval_higher_order_array_callbacks_reject_nested_arrays() {
    let (cm, vs) = make_test_env();
    for formula in [
        "=MAP({1,2}, LAMBDA(x, SEQUENCE(1,2)))",
        "=SCAN(0,{1,2},LAMBDA(acc,x,SEQUENCE(1,2)))",
        "=BYROW({1;2}, LAMBDA(r, SEQUENCE(1,2)))",
        "=BYCOL({1,2}, LAMBDA(c, SEQUENCE(2,1)))",
        "=MAKEARRAY(1,1,LAMBDA(r,c,SEQUENCE(1,2)))",
        "=MAP({1}, LAMBDA(x, LAMBDA(y,y)))",
        "=MAKEARRAY(1,1,LAMBDA(r,c,LAMBDA(x,x)))",
    ] {
        assert_eq!(
            eval_str(formula, &cm, &vs),
            Value::Error(ValueError::Calc),
            "{formula}"
        );
    }
}

// ── BYROW / BYCOL (Part B) ────────────────────────────────────────

/// `=BYROW(SEQUENCE(2,3), LAMBDA(r, SUM(r)))` →
/// row sums = [1+2+3, 4+5+6] = [6, 15] as 2×1.
#[test]
fn eval_byrow_sum() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=BYROW(SEQUENCE(2,3), LAMBDA(r, SUM(r)))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 1));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(6.0)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(15.0)));
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

/// `=BYCOL(SEQUENCE(2,3), LAMBDA(c, SUM(c)))` →
/// column sums = [1+4, 2+5, 3+6] = [5, 7, 9] as 1×3.
#[test]
fn eval_bycol_sum() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=BYCOL(SEQUENCE(2,3), LAMBDA(c, SUM(c)))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(5.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(7.0)));
            assert_eq!(arr.get(0, 2), Some(&Value::Number(9.0)));
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

// ── MAKEARRAY (Part B) ────────────────────────────────────────────

/// `=MAKEARRAY(2, 3, LAMBDA(i, j, i*j))` →
///   row 1: 1*1=1, 1*2=2, 1*3=3
///   row 2: 2*1=2, 2*2=4, 2*3=6
#[test]
fn eval_makearray_product() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=MAKEARRAY(2, 3, LAMBDA(i, j, i*j))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 3));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(2.0)));
            assert_eq!(arr.get(0, 2), Some(&Value::Number(3.0)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(2.0)));
            assert_eq!(arr.get(1, 1), Some(&Value::Number(4.0)));
            assert_eq!(arr.get(1, 2), Some(&Value::Number(6.0)));
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}

/// MAKEARRAY cap matches SEQUENCE — over 1M elements → InvalidValue.
#[test]
fn eval_makearray_cap_enforced() {
    let (cm, vs) = make_test_env();
    // 1025 * 1025 = 1,050,625 > 1,048,576.
    assert_eq!(
        eval_str("=MAKEARRAY(1025, 1025, LAMBDA(i, j, i+j))", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
