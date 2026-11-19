//! Engine physical sort (`sort_range`) — S1 slice of
//! `excel/solid-excel/docs/archive/online-excel-parity/design-engine-sort.md`.
//!
//! Semantics (normative, per the design adjudications):
//!
//!   - **Comparator** (`sort_cmp`, §3.2): Excel type order
//!     number < text < boolean < error < empty; empty sorts LAST by default
//!     in both directions; `SortKey.empty_first` explicitly pins it first.
//!     Descending reverses only the non-empty comparison.
//!     Text compares case-folded by default (`case_sensitive: false`)
//!     in code-point order — deliberately NO locale collation, so the
//!     result is deterministic across static/worker/platforms.
//!   - **Slot algorithm** (§6.2): rows listed in `excluded_rows` keep
//!     their position and never participate in comparison; the remaining
//!     "visible slots" are stably permuted in place. Key values are
//!     materialized (evaluated) before any move.
//!   - **Formulas move VERBATIM** (§4): AST / parked source text is
//!     relocated without reference translation — the sort path never
//!     touches `shift.rs` and can never mint `#REF!` sentinels.
//!   - **Formats** (§5.3): cellStyle rides along with `relocate_cells`;
//!     rowStyle / columnStyle stay attached to their physical axes. Row
//!     heights do NOT move (Excel behavior).
//!   - **Spill** (§5.1): any intersection between the range and an ACTIVE
//!     spill (anchor or target) is rejected up front, so no installed
//!     projection ever needs tearing down — the permutation is identity
//!     outside the range. COLLIDED anchors (`#SPILL!`, zero targets
//!     installed) are deliberately NOT gated — see `is_spill_region` — and
//!     therefore ride the same snapshot → move → re-derive pipeline the
//!     structural edits use (ADR 0006 stage 0/2, in `sort_range` below).

use std::cmp::Ordering;

use einfach_core::Value;

use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::{collapse_array_for_eval, Sheet};
use crate::workbook::Workbook;

mod appearance_key;
mod color_key;
mod compare;
mod contract;
mod display_colors;
mod icon_key;
mod prepare_appearance;
mod reorder;
mod slots;
mod visual;

pub use color_key::{SortColorKey, SortColorPosition, SortColorSource};
pub use icon_key::SortIconKey;
pub use visual::SortCriterion;
pub use compare::{sort_cmp, sort_cmp_with_direction, sort_cmp_with_direction_and_list};
pub use contract::{SortDirection, SortKey, SortRangeError, SortRangeReport};

#[cfg(test)]
mod tests;

impl Sheet {
    /// Physically sort `range` by `keys`, keeping `excluded_rows` in place
    /// (design §3/§6). Rows in `excluded_rows` outside the range are
    /// ignored; duplicates are deduplicated. Keys are evaluated results
    /// (formulas sort by value), materialized before any move. Returns a
    /// no-op report (`moved_rows: 0`) without writing anything when the
    /// permutation is identity.
    pub fn sort_range(
        &mut self,
        range: CellRange,
        keys: &[SortKey],
        excluded_rows: &[u32],
    ) -> Result<SortRangeReport, SortRangeError> {
        let n = range.normalize();
        let visible = self.sort_slots(n, keys.iter().map(|key| key.col), excluded_rows)?;
        if visible.len() <= 1 {
            return Ok(SortRangeReport::default());
        }

        // Materialize every key tuple BEFORE any move — no mid-permutation
        // reads. Evaluated results: formulas sort by value (§3.1). Settle
        // pending derived reads afterwards so the relocation write does
        // not inherit per-read bookkeeping (same hygiene as `get_cell`).
        let key_values: Vec<Vec<Value>> = visible
            .iter()
            .map(|&row| {
                keys.iter()
                    .map(|k| collapse_array_for_eval(self.peek_value(CellAddress::new(row, k.col))))
                    .collect()
            })
            .collect();
        self.store.settle_pending_reads();

        Ok(self.apply_sort_order(n, &visible, |ia, ib| {
            for (ki, key) in keys.iter().enumerate() {
                let (a, b) = (&key_values[ia][ki], &key_values[ib][ki]);
                let ord = compare::compare_key_values(key, a, b);
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            Ordering::Equal
        }))
    }
}

impl Workbook {
    /// Workbook entry point for the physical sort. A missing `sheet_idx`
    /// is reported as `InvalidRange` (the request addresses a range that
    /// does not exist); everything else delegates to
    /// [`Sheet::sort_range`]. Cross-sheet dependents recompute through
    /// the shared Store like any other same-sheet mutation.
    pub fn sort_range(
        &mut self,
        sheet_idx: usize,
        range: CellRange,
        keys: &[SortKey],
        excluded_rows: &[u32],
    ) -> Result<SortRangeReport, SortRangeError> {
        if self.sheet(sheet_idx).is_none() { return Err(SortRangeError::InvalidRange); }
        self.ensure_range_editable(sheet_idx, range.normalize())
            .map_err(|_| SortRangeError::ProtectedRange)?;
        let Some(sheet) = self.sheet_mut(sheet_idx) else {
            return Err(SortRangeError::InvalidRange);
        };
        sheet.sort_range(range, keys, excluded_rows)
    }
}
