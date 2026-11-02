use einfach_core::Value;

use crate::cell::CellAddress;

/// One reversible cell-level edit. Stores the previous and next state so
/// undo and redo can both be implemented as "apply this in reverse".
///
/// `formula` is set when the slot held a formula; `value` is set when the
/// slot held a primitive value (or was empty / Null).
#[derive(Clone, Debug, PartialEq)]
pub struct CellSnapshot {
    pub addr: CellAddress,
    pub value: Option<Value>,
    pub formula: Option<String>,
}

impl CellSnapshot {
    pub fn empty(addr: CellAddress) -> Self {
        CellSnapshot {
            addr,
            value: None,
            formula: None,
        }
    }
    pub fn value(addr: CellAddress, v: Value) -> Self {
        CellSnapshot {
            addr,
            value: Some(v),
            formula: None,
        }
    }
    pub fn formula(addr: CellAddress, f: String) -> Self {
        CellSnapshot {
            addr,
            value: None,
            formula: Some(f),
        }
    }
}

