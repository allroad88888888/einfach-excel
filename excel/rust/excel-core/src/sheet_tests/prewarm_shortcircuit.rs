//! 短路函数里没被选中的分支不会被预热。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

/// Regression for chain warmup and short-circuit interaction: static
/// dependency discovery must not evaluate the untaken branch of
/// `=IF(TRUE,0,B1)`. Only A1 should evaluate.
#[test]
fn if_true_does_not_prewarm_unused_branch() {
    let mut sheet = Sheet::new();
    sheet.set_formula("B1", "=1+1");
    sheet.set_formula("A1", "=IF(TRUE,0,B1)");
    assert_eq!(sheet.get_cell("A1"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        1,
        "prewarm should not have evaluated B1 — IF(TRUE,...) skips it"
    );
}

/// Mirror of `if_true_does_not_prewarm_unused_branch` for the
/// false branch path. `=IF(FALSE, B1, 0)` selects the else branch; B1
/// must not be pre-warmed (it's on the never-taken then-branch).
#[test]
fn if_false_does_not_prewarm_unused_branch() {
    let mut sheet = Sheet::new();
    sheet.set_formula("B1", "=1+1");
    sheet.set_formula("A1", "=IF(FALSE,B1,0)");
    assert_eq!(sheet.get_cell("A1"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        1,
        "prewarm should not have evaluated B1 — IF(FALSE,...) skips the then-branch"
    );
}

/// IFS — variadic short-circuit. Only the first matching (cond, val)
/// pair runs at eval time. Prewarm must not greedily evaluate any
/// of the (cond_i, val_i) pairs beyond the first condition.
#[test]
fn ifs_does_not_prewarm_unused_branches() {
    let mut sheet = Sheet::new();
    sheet.set_formula("B1", "=1+1");
    sheet.set_formula("C1", "=2+2");
    sheet.set_formula("D1", "=3+3");
    // First condition is TRUE → only `0` is taken.
    sheet.set_formula("A1", "=IFS(TRUE,0,FALSE,B1,FALSE,C1)");
    assert_eq!(sheet.get_cell("A1"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        1,
        "prewarm should not have evaluated B1/C1 — IFS short-circuits on the first true cond"
    );
    assert!(matches!(sheet.get_cell("D1"), Value::Number(_)));
}

/// IFERROR's second arg is only evaluated when the first errors. With
/// a non-error primary, prewarm must skip the fallback expression.
#[test]
fn iferror_does_not_prewarm_fallback() {
    let mut sheet = Sheet::new();
    sheet.set_formula("B1", "=1+1");
    sheet.set_formula("A1", "=IFERROR(0,B1)");
    assert_eq!(sheet.get_cell("A1"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        1,
        "prewarm should not have evaluated B1 — IFERROR fallback only runs on error"
    );
}

/// SWITCH: only the matching case (or default) runs. Prewarm must
/// not greedily evaluate any of the non-leading value expressions.
/// First (case, value) pair always evaluates the case at eval time,
/// but the value cells should not be prewarmed.
#[test]
fn switch_does_not_prewarm_unused_branches() {
    let mut sheet = Sheet::new();
    sheet.set_formula("B1", "=1+1");
    sheet.set_formula("C1", "=2+2");
    // SWITCH(1, 1, 0, 2, B1, C1) — first case matches → value is 0.
    // B1 (val for case 2) and C1 (default) must not be pre-warmed.
    sheet.set_formula("A1", "=SWITCH(1,1,0,2,B1,C1)");
    assert_eq!(sheet.get_cell("A1"), Value::Number(0.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        1,
        "prewarm should not have evaluated B1/C1 — SWITCH only runs the matched value / default"
    );
}
