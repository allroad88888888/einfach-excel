//! 深公式链的读取不靠 Rust 递归栈。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

/// Linear formula chain `A1 = 1; A2 = =A1+1; ... A1000 = =A999+1`.
///
/// The formula-inner read path must resolve a 1000-deep chain without
/// recursive Rust calls proportional to the chain length. Native stacks
/// can hide that bug; WASM stacks cannot.
#[test]
fn chain_1000_native_read_does_not_panic() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    for i in 2..=1000 {
        let addr = format!("A{i}");
        let src = format!("=A{}+1", i - 1);
        assert!(
            sheet.set_formula(&addr, &src),
            "set_formula failed for {addr}"
        );
    }
    let v = sheet.get_cell("A1000");
    assert_eq!(v, Value::Number(1000.0));
}

/// Same chain shape, but at a depth that would also overflow even a
/// release-mode native stack with recursive formula-cell evaluation.
#[test]
fn chain_10000_native_read_does_not_panic() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    for i in 2..=10_000 {
        let addr = format!("A{i}");
        let src = format!("=A{}+1", i - 1);
        assert!(
            sheet.set_formula(&addr, &src),
            "set_formula failed for {addr}"
        );
    }
    let v = sheet.get_cell("A10000");
    assert_eq!(v, Value::Number(10_000.0));
}

/// Re-read after a chain is fully populated: the second read should hit
/// the Clean cache (no re-eval) and complete in trivial time. Also
/// pins that the prewarm's early-out for Clean cells works correctly.
#[test]
fn chain_1000_native_re_read_uses_cache() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    for i in 2..=1000 {
        let addr = format!("A{i}");
        let src = format!("=A{}+1", i - 1);
        assert!(sheet.set_formula(&addr, &src));
    }
    assert_eq!(sheet.get_cell("A1000"), Value::Number(1000.0));
    let count_before = sheet.debug_formula_eval_count();
    // Second read hits the clean Store-derived tail. Counter must not
    // advance.
    assert_eq!(sheet.get_cell("A1000"), Value::Number(1000.0));
    assert_eq!(sheet.debug_formula_eval_count(), count_before);
}
