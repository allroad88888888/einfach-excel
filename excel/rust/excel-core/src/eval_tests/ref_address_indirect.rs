//! ADDRESS/INDIRECT/CHOOSE 的地址构造与间接寻址。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_choose() {
    let (cm, vs) = make_test_env();
    // Happy path: 1-based picks; arg is evaluated.
    assert_eq!(
        eval_str("=CHOOSE(1,\"a\",\"b\",\"c\")", &cm, &vs),
        Value::Text("a".into())
    );
    assert_eq!(
        eval_str("=CHOOSE(3,\"a\",\"b\",\"c\")", &cm, &vs),
        Value::Text("c".into())
    );
    // Index can be a cell ref; A1=10 → out of range for 3 args.
    assert_eq!(
        eval_str("=CHOOSE(2,A1,B1,A2)", &cm, &vs),
        Value::Number(20.0)
    );
    // Truncation: 1.7 → 1.
    assert_eq!(
        eval_str("=CHOOSE(1.7,\"a\",\"b\")", &cm, &vs),
        Value::Text("a".into())
    );
    // Out of range.
    assert_eq!(
        eval_str("=CHOOSE(4,\"a\",\"b\",\"c\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=CHOOSE(0,\"a\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count: need at least 2 (index + 1 value).
    assert_eq!(
        eval_str("=CHOOSE(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Non-numeric index.
    assert_eq!(
        eval_str("=CHOOSE(\"x\",\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_address() {
    let (cm, vs) = make_test_env();
    // Default abs_num=1: $A$1.
    assert_eq!(
        eval_str("=ADDRESS(1,1)", &cm, &vs),
        Value::Text("$A$1".into())
    );
    // abs_num=2: A$1 (row absolute, col relative).
    assert_eq!(
        eval_str("=ADDRESS(1,1,2)", &cm, &vs),
        Value::Text("A$1".into())
    );
    // abs_num=3: $A1 (col absolute, row relative).
    assert_eq!(
        eval_str("=ADDRESS(1,1,3)", &cm, &vs),
        Value::Text("$A1".into())
    );
    // abs_num=4: A1.
    assert_eq!(
        eval_str("=ADDRESS(1,1,4)", &cm, &vs),
        Value::Text("A1".into())
    );
    // Multi-letter column: col 27 → AA.
    assert_eq!(
        eval_str("=ADDRESS(3,27,4)", &cm, &vs),
        Value::Text("AA3".into())
    );
    // R1C1 (a1=FALSE), abs_num=1: R3C5.
    assert_eq!(
        eval_str("=ADDRESS(3,5,1,FALSE)", &cm, &vs),
        Value::Text("R3C5".into())
    );
    // R1C1 with abs_num=4: R[3]C[5].
    assert_eq!(
        eval_str("=ADDRESS(3,5,4,FALSE)", &cm, &vs),
        Value::Text("R[3]C[5]".into())
    );
    // Sheet prefix (no spaces): unquoted.
    assert_eq!(
        eval_str("=ADDRESS(1,1,1,TRUE,\"Sheet1\")", &cm, &vs),
        Value::Text("Sheet1!$A$1".into())
    );
    // Sheet prefix (with space): quoted.
    assert_eq!(
        eval_str("=ADDRESS(1,1,1,TRUE,\"My Sheet\")", &cm, &vs),
        Value::Text("'My Sheet'!$A$1".into())
    );
    // Bad abs_num.
    assert_eq!(
        eval_str("=ADDRESS(1,1,9)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Bad row (< 1).
    assert_eq!(
        eval_str("=ADDRESS(0,1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=ADDRESS(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_indirect() {
    let (cm, vs) = make_test_env();
    // Happy path: "A1" → A1 value (10).
    assert_eq!(eval_str("=INDIRECT(\"A1\")", &cm, &vs), Value::Number(10.0));
    // Absolute markers stripped: "$B$1" → 20.
    assert_eq!(
        eval_str("=INDIRECT(\"$B$1\")", &cm, &vs),
        Value::Number(20.0)
    );
    // Range text → first (top-left) cell.
    assert_eq!(
        eval_str("=INDIRECT(\"A1:B2\")", &cm, &vs),
        Value::Number(10.0)
    );
    // Malformed text.
    assert_eq!(
        eval_str("=INDIRECT(\"not a ref\")", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval_str("=INDIRECT(\"\")", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
    // R1C1 mode unsupported.
    assert_eq!(
        eval_str("=INDIRECT(\"R1C1\",FALSE)", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=INDIRECT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=INDIRECT(\"A1\",TRUE,\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
