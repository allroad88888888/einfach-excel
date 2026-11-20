//! Existing sort fixtures shared by the regression suites.

use einfach_core::Value;

use super::{CellAddress, CellRange, Sheet, SortDirection, SortKey};

mod comparison;
mod placement;
mod formats;
mod guards;

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).unwrap()
}

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(addr(a), addr(b))
}

fn asc(col: u32) -> SortKey {
    SortKey {
        col,
        direction: SortDirection::Ascending,
        case_sensitive: false,
        empty_first: false,
        custom_list: None,
    }
}

fn desc(col: u32) -> SortKey {
    SortKey {
        col,
        direction: SortDirection::Descending,
        case_sensitive: false,
        empty_first: false,
        custom_list: None,
    }
}

fn num(n: f64) -> Value {
    Value::Number(n)
}

fn text(s: &str) -> Value {
    Value::Text(s.into())
}

/// Column-A values of `sheet` for rows 0..count as display-ish enums.
fn col_values(sheet: &Sheet, col: &str, count: u32) -> Vec<Value> {
    (1..=count)
        .map(|r| sheet.get_cell(&format!("{col}{r}")))
        .collect()
}
