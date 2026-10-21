//! Synchronize a rule's number-display input without retaining any base-style facts.
use super::display_key;
use crate::{CellAddress, CellRange, Sheet};
use crate::sheet::collapse_array_for_eval;
use einfach_core::{ArrayData, AtomId, Store, Value};
use std::collections::HashMap;
use std::sync::Arc;

pub(crate) fn sync_format_input(
    store: &Store, input: AtomId, sheet: &Sheet, ranges: impl Iterator<Item = CellRange>,
) {
    // One sparse synchronization per relevant rule / projection. Values are computed keys,
    // never a second cellStyle/rowStyle/columnStyle map or a scan of empty worksheet cells.
    let mut keys = Vec::new();
    for range in ranges {
        sheet.for_each_sparse_cell_with(range, &|sheet, addr| sheet.peek_value(addr), &mut |addr, value| {
            let value = collapse_array_for_eval(value);
            if matches!(value, Value::Number(number) if number.is_finite()) {
                if let Some(key) = display_key(&value, &sheet.base_format_at(addr)) {
                    keys.extend([Value::Number(f64::from(addr.row)), Value::Number(f64::from(addr.col)), Value::Text(key)]);
                }
            }
        });
    }
    // Equal input leaves statistics cached. Number-format edits and async/formula value
    // changes are synchronized before a cached statistic can be consumed.
    store.set(input, Value::Array(Arc::new(ArrayData::new((keys.len() / 3) as u32, 3, keys))));
}

pub(crate) fn read_format_keys(value: Value) -> HashMap<CellAddress, String> {
    let mut display_keys = HashMap::new();
    if let Value::Array(keys) = value {
        for index in 0..keys.rows {
            if let (Some(Value::Number(row)), Some(Value::Number(col)), Some(Value::Text(key))) =
                (keys.get(index, 0), keys.get(index, 1), keys.get(index, 2)) {
                display_keys.insert(CellAddress::new(*row as u32, *col as u32), key.clone());
            }
        }
    }
    display_keys
}
