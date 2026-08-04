//! 单元格字面量的读写，以及地址到原子的映射。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn new_cell_is_null() {
    let sheet = Sheet::new();
    assert_eq!(sheet.get_cell("A1"), Value::Null);
}

#[test]
fn get_cell_does_not_materialize_empty_cell() {
    let sheet = Sheet::new();
    assert_eq!(sheet.interior.cells.borrow().len(), 0);
    assert_eq!(sheet.get_cell("A1"), Value::Null);
    assert_eq!(sheet.interior.cells.borrow().len(), 0);
}

#[test]
fn set_and_get_number() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(42.0));
    assert_eq!(sheet.get_cell("A1"), Value::Number(42.0));
}

#[test]
fn set_and_get_text() {
    let mut sheet = Sheet::new();
    sheet.set_cell("B2", Value::Text("hello".into()));
    assert_eq!(sheet.get_cell("B2"), Value::Text("hello".into()));
}

#[test]
fn multiple_cells_independent() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("A2", Value::Text("hi".into()));

    assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A2"), Value::Text("hi".into()));
}

#[test]
fn overwrite_cell() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A1", Value::Number(99.0));
    assert_eq!(sheet.get_cell("A1"), Value::Number(99.0));
}

#[test]
fn cell_atom_returns_same_id() {
    let mut sheet = Sheet::new();
    let id1 = sheet.cell_atom("A1");
    let id2 = sheet.cell_atom("A1");
    assert_eq!(id1, id2);
}

#[test]
fn different_cells_different_ids() {
    let mut sheet = Sheet::new();
    let id1 = sheet.cell_atom("A1");
    let id2 = sheet.cell_atom("B1");
    assert_ne!(id1, id2);
}

#[test]
fn set_boolean_cell() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C3", Value::Boolean(true));
    assert_eq!(sheet.get_cell("C3"), Value::Boolean(true));
}

#[test]
#[should_panic(expected = "invalid cell address")]
fn invalid_address_panics() {
    let mut sheet = Sheet::new();
    sheet.set_cell("", Value::Number(1.0));
}
