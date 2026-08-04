//! 清空 / 置空之后原子的回收与保留。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === 3.10 — primitive atom GC on clear / set-Null ===

#[test]
fn clear_cell_releases_primitive_when_no_deps() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(42.0));
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(sheet.debug_total_atom_count(), 1);

    sheet.clear_cell("A1");
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        0,
        "clear_cell on a no-dep cell must release its primitive"
    );
    assert_eq!(
        sheet.debug_total_atom_count(),
        0,
        "store should hold no live atoms after clearing the only cell"
    );
    // Subsequent read still produces Null naturally.
    assert_eq!(sheet.get_cell("A1"), Value::Null);
}

#[test]
fn clear_cell_keeps_primitive_when_formula_depends() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(5.0));
    sheet.set_formula("B1", "=A1*2");
    // Lazy backend: only A1 is materialized as a primitive. B1 is a
    // formula record with no primitive scaffold.
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));

    // After eval, B1's formula-inner atom depends on A1's facade.
    // Clearing A1 sets the value to Null, and B1 re-evaluates against
    // that new value on the next read.
    sheet.clear_cell("A1");
    // B1 re-evaluates against A1 = Null → coerced to 0 → 0 * 2 = 0.
    assert_eq!(sheet.get_cell("B1"), Value::Number(0.0));
    assert_eq!(sheet.get_cell("A1"), Value::Null);
}

#[test]
fn set_cell_to_null_releases_primitive() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.debug_primitive_atom_count(), 1);

    sheet.set_cell("A1", Value::Null);
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        0,
        "set_cell(_, Null) must drop the primitive when no deps"
    );
    assert_eq!(sheet.debug_total_atom_count(), 0);
}

#[test]
fn subscribed_cell_release_keeps_listener_alive() {
    // Subscriber contract on release: the bucket's listener list survives
    // while the stable facade retargets from the primitive to Absent.
    // Clearing publishes Null through that facade, and the next write
    // reuses the same stable subscription anchor.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("A1", move || *cc.borrow_mut() += 1);
    // Pre: subscribed but no atom yet.
    assert_eq!(sheet.debug_primitive_atom_count(), 0);

    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.debug_primitive_atom_count(), 1);
    assert_eq!(*count.borrow(), 1, "first write fires listener");

    sheet.set_cell("A1", Value::Null);
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        0,
        "subscribed facade must not keep a Null primitive slot alive"
    );
    assert_eq!(
        *count.borrow(),
        2,
        "Number → Null is a value change → listener fires"
    );
    // Bucket still tracks the listener: subscriptions map keeps the entry.
    assert!(
        sheet
            .cell_subscriptions
            .get(&CellAddress::parse("A1").unwrap())
            .map(|b| !b.listeners.borrow().is_empty())
            .unwrap_or(false),
        "listener bucket must survive primitive release"
    );

    sheet.set_cell("A1", Value::Number(7.0));
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        1,
        "next write reuses the subscribed primitive path"
    );
    assert_eq!(*count.borrow(), 3, "fresh primitive notifies the listener");
    assert_eq!(sheet.get_cell("A1"), Value::Number(7.0));
}

#[test]
fn set_cell_then_clear_cycles_do_not_grow_atom_count() {
    // Long-running spreadsheet stress: many set/clear cycles on the same
    // address must not leak atoms. With 3.10 each cycle releases the
    // primitive at the bottom of the loop.
    let mut sheet = Sheet::new();
    for n in 0..100 {
        sheet.set_cell("A1", Value::Number(n as f64));
        sheet.clear_cell("A1");
    }
    assert_eq!(sheet.debug_primitive_atom_count(), 0);
    assert_eq!(sheet.debug_total_atom_count(), 0);
}

#[test]
fn formula_to_null_releases_primitive_when_no_deps() {
    // Formula → primitive(Null) path: with_remap reattaches the fanout to
    // the freshly ensured primitive, then try_release_primitive at the
    // end of set_cell drops it because nothing depends on it.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(4.0));
    // Lazy formula: only A1 is materialized. B1 is a formula record, not
    // a primitive scaffold.
    assert_eq!(sheet.debug_primitive_atom_count(), 1);

    // Clear B1: formula goes away, primitive scaffold is Null and has no
    // dependents (B1 is a leaf, not referenced by anything). It gets
    // released; A1 is unaffected.
    sheet.clear_cell("B1");
    assert_eq!(
        sheet.debug_primitive_atom_count(),
        1,
        "B1 stays unmaterialized, A1 stays"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Null);
    assert_eq!(sheet.get_cell("A1"), Value::Number(2.0));
    assert_eq!(sheet.get_formula("B1"), None);
    assert_eq!(
        sheet.debug_total_atom_count(),
        1,
        "only A1's live primitive may remain after the leaf formula clears"
    );
}

#[test]
fn clearing_leaf_formula_unmounts_unobserved_upstream_formula_chain() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("B1", "=A1+1"));
    assert!(sheet.set_formula("C1", "=B1+1"));
    assert_eq!(sheet.get_cell("C1"), Value::Number(3.0));

    sheet.clear_cell("C1");

    assert_eq!(sheet.debug_formula_count(), 1, "B1 remains a live formula");
    assert_eq!(
        sheet.debug_total_atom_count(),
        1,
        "the cold B1 chain must unmount back to A1's primitive"
    );
    assert_eq!(
        sheet.get_cell("B1"),
        Value::Number(2.0),
        "reading B1 must lazily remount the same Store-derived formula"
    );
}

#[test]
fn clearing_formula_diamond_retries_shared_upstream_eviction() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("A2", "=A1+1"));
    assert!(sheet.set_formula("B1", "=A2+1"));
    assert!(sheet.set_formula("C1", "=A2+2"));
    assert!(sheet.set_formula("D1", "=B1+C1"));
    assert_eq!(sheet.get_cell("D1"), Value::Number(7.0));

    sheet.clear_cell("D1");

    assert_eq!(sheet.debug_formula_count(), 3);
    assert_eq!(
        sheet.debug_total_atom_count(),
        1,
        "the shared A2 chain must be retried after both branches unmount"
    );
    assert_eq!(sheet.get_cell("A2"), Value::Number(2.0));
}
