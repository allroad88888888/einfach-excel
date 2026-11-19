//! Validate sortable rows before reading any comparison values.

use std::collections::HashSet;

use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::{Sheet, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};

use super::axis::SortAxis;
use super::SortRangeError;

fn ranges_intersect(a: CellRange, b: CellRange) -> bool {
    let (a, b) = (a.normalize(), b.normalize());
    !(a.end.row < b.start.row
        || a.start.row > b.end.row
        || a.end.col < b.start.col
        || a.start.col > b.end.col)
}

impl Sheet {
    /// §5.1 spill gate: first active spill rectangle (anchor plus targets)
    /// intersecting `range`, reported by its anchor. Deterministic: the
    /// top-left-most intersecting anchor wins (HashMap iteration order
    /// must not leak into the rejection payload).
    pub(crate) fn spill_intersecting(&self, range: CellRange) -> Option<CellAddress> {
        let mut hit: Option<CellAddress> = None;
        for anchor in self.spill_anchor_addr.values().copied() {
            let (rows, cols) = self.spill_info(anchor).unwrap_or((1, 1));
            let rect = CellRange::new(
                anchor,
                CellAddress::new(anchor.row + rows.max(1) - 1, anchor.col + cols.max(1) - 1),
            );
            if ranges_intersect(rect, range)
                && hit.is_none_or(|h| (anchor.row, anchor.col) < (h.row, h.col))
            {
                hit = Some(anchor);
            }
        }
        hit
    }

    pub(super) fn sort_slots(
        &self,
        range: CellRange,
        columns: impl Iterator<Item = u32>,
        excluded_rows: &[u32],
    ) -> Result<Vec<u32>, SortRangeError> {
        let n = range.normalize();
        self.validate_sort_layout(n, SortAxis::Rows, columns)?;

        // Visible slots: the range's rows minus the (deduped, clamped)
        // excluded set, ascending.
        let excluded: HashSet<u32> = excluded_rows
            .iter()
            .copied()
            .filter(|r| *r >= n.start.row && *r <= n.end.row)
            .collect();
        let visible: Vec<u32> = (n.start.row..=n.end.row)
            // 筛掉行由引擎自己排除；手动隐藏行仍参与，不依赖宿主传回隐藏集合。
            .filter(|r| !excluded.contains(r)
                && !self.filter_hidden_set().is_some_and(|rows| rows.contains(r)))
            .collect();
        Ok(visible)
    }

    pub(super) fn validate_sort_layout(
        &self,
        n: CellRange,
        axis: SortAxis,
        keys: impl Iterator<Item = u32>,
    ) -> Result<(), SortRangeError> {
        if n.end.row >= EXCEL_MAX_ROWS || n.end.col >= EXCEL_MAX_COLS {
            return Err(SortRangeError::InvalidRange);
        }
        let mut keys = keys.peekable();
        if keys.peek().is_none() {
            return Err(SortRangeError::EmptyKeys);
        }
        if keys.any(|key| !axis.keys(n).contains(&key)) {
            return Err(SortRangeError::KeyOutOfRange);
        }
        if let Some(anchor) = self.spill_intersecting(n) {
            return Err(SortRangeError::SpillIntersectsRange { anchor });
        }
        if self.merged_ranges().iter().any(|merged| merged.intersects(n)) {
            return Err(SortRangeError::MergeIntersectsRange);
        }
        Ok(())
    }
}
