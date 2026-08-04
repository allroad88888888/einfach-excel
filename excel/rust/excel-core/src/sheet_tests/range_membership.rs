//! 区域成员变动之后依赖它的公式怎么重算。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn subscribe_range_formula_fires_once_on_member_change() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A2", Value::Number(2.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(7.0));
    assert_eq!(
        *count.borrow(),
        1,
        "range formula subscriber fires exactly once"
    );
}

#[test]
fn subscribe_range_formula_fires_once_on_new_member_change() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("A2", Value::Number(2.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(
        *count.borrow(),
        1,
        "range formula subscriber fires exactly once when membership grows"
    );
}

#[test]
fn range_formula_membership_change_uses_store_edges() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let evals_before = sheet.debug_formula_eval_count();
    let visits_before = sheet.debug_reverse_dep_visit_count();

    sheet.set_cell("A2", Value::Number(2.0));

    assert_eq!(
        sheet.debug_reverse_dep_visit_count() - visits_before,
        1,
        "Store reverse reachability should find the affected formula once"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        evals_before + 1,
        "Store-tracked range inputs should drive one formula-inner recompute"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(
        sheet.debug_formula_eval_count(),
        evals_before + 1,
        "post-write read should hit the clean Store-derived value"
    );
}

#[test]
fn batch_range_formula_membership_change_uses_store_edges() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let evals_before = sheet.debug_formula_eval_count();
    let visits_before = sheet.debug_reverse_dep_visit_count();

    sheet.batch_set(&[("A2", Value::Number(2.0))]);

    assert_eq!(
        sheet.debug_reverse_dep_visit_count() - visits_before,
        1,
        "batch membership changes should discover one Store dependent"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);
}

#[test]
fn bulk_range_formula_membership_change_uses_store_edges() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let evals_before = sheet.debug_formula_eval_count();
    let visits_before = sheet.debug_reverse_dep_visit_count();

    sheet.bulk_load(|bulk| {
        bulk.set_cell("A2", Value::Number(2.0));
    });

    assert_eq!(
        sheet.debug_reverse_dep_visit_count() - visits_before,
        1,
        "bulk membership changes should discover one Store dependent"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);
}
