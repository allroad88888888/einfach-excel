//! 动态数组格数上限对大规模物化的拦截。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_dynamic_array_cap_blocks_large_materialization() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=VSTACK(SEQUENCE(1024,1024),0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=HSTACK(SEQUENCE(1024,1024),0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=TOROW(A1:B1048576)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=A1:B1048576+1", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
