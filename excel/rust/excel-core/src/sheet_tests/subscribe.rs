//! 单格订阅在写入与换绑之下的存活。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn subscribe_cell_fires_on_change() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=A1*2");

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));
    assert_eq!(*count.borrow(), 1, "exactly one fire on dependency change");

    sheet.unsubscribe_cell(sub);
    sheet.set_cell("A1", Value::Number(10.0));
    assert_eq!(*count.borrow(), 1, "no fire after unsubscribe");
}

#[test]
fn subscribe_empty_cell_does_not_materialize_until_write() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let sub = sheet.subscribe_cell("A1", move || *cc.borrow_mut() += 1);

    assert_eq!(
        sheet.interior.cells.borrow().len(),
        0,
        "subscription should not allocate A1"
    );
    sheet.set_cell("A1", Value::Number(1.0));
    assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
    assert_eq!(sheet.interior.cells.borrow().len(), 1);
    assert_eq!(*count.borrow(), 1, "exactly one fire on first write");

    sheet.unsubscribe_cell(sub);
    sheet.set_cell("A1", Value::Number(2.0));
    assert_eq!(*count.borrow(), 1, "no fire after unsubscribe");
}

#[test]
fn subscribe_empty_cell_then_set_formula_fires_once() {
    // Regression: with_remap used to gate notify on `had_sub` (whether a
    // store_sub was already attached). A bucket subscribed to an empty
    // cell has listeners but no store_sub yet — the first set_formula
    // would update state but never fire the listener.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(3.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);
    // Pre-condition: B1 has no atom yet.
    assert!(!sheet
        .interior
        .cells
        .borrow()
        .contains_key(&CellAddress::new(0, 1)));

    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(6.0));
    assert_eq!(
        *count.borrow(),
        1,
        "first set_formula on empty subscribed cell must fire"
    );

    // And the subscription stays live: changing A1 fires once more.
    sheet.set_cell("A1", Value::Number(5.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));
    assert_eq!(
        *count.borrow(),
        2,
        "subscriber should also see the dependency change"
    );
}

#[test]
fn subscribe_survives_value_to_formula_remap() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(5.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(
        *count.borrow(),
        1,
        "exactly one fire when B1 becomes a formula"
    );

    sheet.set_cell("A1", Value::Number(3.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(6.0));
    assert_eq!(
        *count.borrow(),
        2,
        "subscriber must stay attached to B1's formula atom"
    );
}

#[test]
fn subscribe_survives_formula_to_value_remap() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_formula("B1", "=A1*2");

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("B1", Value::Number(10.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));
    assert_eq!(*count.borrow(), 1, "exactly one fire when formula cleared");

    sheet.set_cell("B1", Value::Number(11.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(11.0));
    assert_eq!(
        *count.borrow(),
        2,
        "subscriber must stay attached to B1's primitive atom"
    );
}

#[test]
fn subscribe_cell_boxed_fires_like_subscribe_cell() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let listener: Box<dyn CellListener> = Box::new(move || *cc.borrow_mut() += 1);
    let sub = sheet.subscribe_cell_boxed("A1", listener);

    sheet.set_cell("A1", Value::Number(1.0));
    assert_eq!(*count.borrow(), 1);

    sheet.unsubscribe_cell(sub);
    sheet.set_cell("A1", Value::Number(2.0));
    assert_eq!(*count.borrow(), 1, "no fire after unsubscribe");
}
