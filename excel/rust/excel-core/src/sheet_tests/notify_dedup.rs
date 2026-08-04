//! 一次写入到底该通知几回（值没变就不通知）。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn formula_to_primitive_remap_fires_listener_exactly_once() {
    // Regression: previously the rewire-then-store.set order caused both
    // the fanout AND an explicit notify to fire on a formula→primitive
    // transition where the new primitive value differed from the prior
    // formula result. Subscribers should see exactly one fire.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_formula("B1", "=A1*2"); // B1 displays 4

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    // Replace the formula with a literal whose value differs from the
    // formula's result (4 → 99). Should fire once, not twice.
    sheet.set_cell("B1", Value::Number(99.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(99.0));
    assert_eq!(
        *count.borrow(),
        1,
        "formula→primitive must fire exactly once"
    );
}

#[test]
fn formula_to_primitive_remap_with_unchanged_value_still_fires_once() {
    // Even when the new primitive value happens to match the prior
    // formula result, subscribers should still be notified that the
    // cell's identity (formula → literal) changed.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_formula("B1", "=A1*2"); // B1 = 4

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("B1", Value::Number(4.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(4.0));
    assert_eq!(
        *count.borrow(),
        1,
        "identity change must fire even if value is unchanged"
    );
}

#[test]
fn primitive_to_primitive_with_same_value_does_not_fire() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(7.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("A1", move || *cc.borrow_mut() += 1);

    sheet.set_cell("A1", Value::Number(7.0));
    assert_eq!(*count.borrow(), 0, "no value change → no fire");
}

#[test]
fn formula_subscriber_dirty_notified_for_same_source_value_writes() {
    // D1 lazy contract: source writes dirty dependent formulas even when
    // the primitive source value is unchanged. Consumers subscribe to the
    // formula cell and re-read on dirty notification.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(7.0));
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(14.0));

    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("B1", move || *cc.borrow_mut() += 1);

    for _ in 0..3 {
        sheet.set_cell("A1", Value::Number(7.0));
    }

    assert_eq!(
        *count.borrow(),
        3,
        "same-value source writes must still dirty-notify formula subscribers"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(14.0));
}

#[test]
fn structural_edit_only_fires_for_addresses_whose_value_changed() {
    // insert_row should not wake subscribers on cells whose displayed
    // value didn't actually change.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A5", Value::Number(5.0));

    // A1 sits above the insert point — its value should not change.
    let a1_count = Rc::new(RefCell::new(0u32));
    let a1c = a1_count.clone();
    let _a1_sub = sheet.subscribe_cell("A1", move || *a1c.borrow_mut() += 1);

    // A5 is below the insert point — it gets shifted to A6, so peeking
    // A5 after the insert returns Null (a value change) and listener fires.
    let a5_count = Rc::new(RefCell::new(0u32));
    let a5c = a5_count.clone();
    let _a5_sub = sheet.subscribe_cell("A5", move || *a5c.borrow_mut() += 1);

    sheet.insert_row(2, 1);

    assert_eq!(*a1_count.borrow(), 0, "A1 unchanged → no fire");
    assert_eq!(*a5_count.borrow(), 1, "A5 shifted away → exactly one fire");
    assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
    assert_eq!(sheet.get_cell("A5"), Value::Null);
    assert_eq!(sheet.get_cell("A6"), Value::Number(5.0));
}
