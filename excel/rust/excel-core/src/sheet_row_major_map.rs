//! 按 (行, 列) 行序存放稀疏单元格数据的容器。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Row-major sparse map over `(row, col) → V`. Wraps a
/// `BTreeMap<row, BTreeMap<col, V>>` so range scans cost
/// O(visited cells) instead of O(total entries). Drop-in replacement
/// for the `HashMap<CellAddress, V>` API the rest of `sheet.rs`
/// already speaks (`get`, `insert`, `remove`, `contains_key`, `len`,
/// `keys`, iteration as `(&CellAddress, &V)`), plus a `range_iter`
/// helper used by `for_each_sparse_cell_with` for O(range) viewport
/// reads (Phase 2 Track F target).
///
/// Stop condition (PHASE2_PARALLEL.md § Stop Conditions): if the
/// BTreeMap-of-BTreeMap overhead at 1M sparse cells exceeds the
/// HashMap version by >2×, pivot to a flat
/// `BTreeMap<(u32, u32), V>` keyed by `(row, col)`. Range scans
/// still work via `cells.range((min_row, 0)..=(max_row, u32::MAX))`
/// plus a per-row filter. We start with the nested shape because it
/// keeps the row-major iter trivial; we have not had to pivot.
pub(crate) struct RowMajorMap<V> {
    pub(super) by_row: BTreeMap<u32, BTreeMap<u32, V>>,
    pub(super) len: usize,
}

impl<V> RowMajorMap<V> {
    pub(crate) fn new() -> Self {
        RowMajorMap {
            by_row: BTreeMap::new(),
            len: 0,
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.len
    }

    #[allow(dead_code)]
    pub(crate) fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub(crate) fn get(&self, addr: &CellAddress) -> Option<&V> {
        self.by_row
            .get(&addr.row)
            .and_then(|row| row.get(&addr.col))
    }

    pub(crate) fn contains_key(&self, addr: &CellAddress) -> bool {
        self.by_row
            .get(&addr.row)
            .map(|row| row.contains_key(&addr.col))
            .unwrap_or(false)
    }

    pub(crate) fn insert(&mut self, addr: CellAddress, value: V) -> Option<V> {
        let row = self.by_row.entry(addr.row).or_default();
        let prev = row.insert(addr.col, value);
        if prev.is_none() {
            self.len += 1;
        }
        prev
    }

    pub(crate) fn remove(&mut self, addr: &CellAddress) -> Option<V> {
        let row = self.by_row.get_mut(&addr.row)?;
        let removed = row.remove(&addr.col);
        if removed.is_some() {
            self.len -= 1;
            if row.is_empty() {
                self.by_row.remove(&addr.row);
            }
        }
        removed
    }

    /// Iterate every `(CellAddress, &V)` in row-major ascending order
    /// (ascending row, then ascending col within each row). Matches
    /// the deterministic order callers rely on for snapshots / undo.
    pub(crate) fn iter(&self) -> impl Iterator<Item = (CellAddress, &V)> + '_ {
        self.by_row.iter().flat_map(|(&row, cols)| {
            cols.iter()
                .map(move |(&col, value)| (CellAddress::new(row, col), value))
        })
    }

    /// Iterate every present `(CellAddress, &V)` inside `range` —
    /// the O(cells_in_range) scan that motivates this whole type.
    /// Visits rows in ascending order, columns ascending within each
    /// row, matching the dense `CellRange::iter()` order so swapping
    /// from a dense walk to this one keeps deterministic output
    /// (e.g. for hash-ordered aggregates / formula dep tracking).
    pub(crate) fn range_iter(
        &self,
        range: CellRange,
    ) -> impl Iterator<Item = (CellAddress, &V)> + '_ {
        let n = range.normalize();
        let (r0, r1) = (n.start.row, n.end.row);
        let (c0, c1) = (n.start.col, n.end.col);
        self.by_row.range(r0..=r1).flat_map(move |(&row, cols)| {
            cols.range(c0..=c1)
                .map(move |(&col, value)| (CellAddress::new(row, col), value))
        })
    }

    /// Row-major key iterator (`HashMap::keys` analog). Returned
    /// keys are reconstructed `CellAddress`es; safe to `.copied()` /
    /// `.collect()` since `CellAddress: Copy`.
    pub(crate) fn keys(&self) -> impl Iterator<Item = CellAddress> + '_ {
        self.by_row
            .iter()
            .flat_map(|(&row, cols)| cols.keys().map(move |&col| CellAddress::new(row, col)))
    }

    /// Row-major value iterator (`HashMap::values` analog). Same
    /// ordering as `iter` minus the address — useful for "count
    /// matching" scans like `debug_dirty_count` that don't care
    /// where each entry lives.
    pub(crate) fn values(&self) -> impl Iterator<Item = &V> + '_ {
        self.by_row.values().flat_map(|cols| cols.values())
    }

    /// Build from unsorted `(addr, V)` pairs in one pass (AUDIT B-2):
    /// sort row-major, then bulk-build the nested BTreeMaps via
    /// `FromIterator` — std's sorted bulk construction packs nodes
    /// linearly instead of paying a random-order tree insert per cell.
    /// At bulk-install scale (1M cells from a HashMap payload) this
    /// beats N individual `insert` calls by a wide margin. Duplicate
    /// addresses resolve last-wins (install payloads are HashMap-backed,
    /// so duplicates cannot occur in practice).
    pub(crate) fn from_unsorted_pairs(mut pairs: Vec<(CellAddress, V)>) -> Self {
        pairs.sort_unstable_by(|(a, _), (b, _)| (a.row, a.col).cmp(&(b.row, b.col)));
        let mut by_row: BTreeMap<u32, BTreeMap<u32, V>> = BTreeMap::new();
        let mut len = 0usize;
        let mut iter = pairs.into_iter().peekable();
        while let Some((first_addr, first_value)) = iter.next() {
            let row = first_addr.row;
            let mut cols: Vec<(u32, V)> = vec![(first_addr.col, first_value)];
            while let Some((next_addr, _)) = iter.peek() {
                if next_addr.row != row {
                    break;
                }
                let (next_addr, next_value) = iter.next().expect("peeked entry present");
                cols.push((next_addr.col, next_value));
            }
            // Sorted input → `FromIterator` takes the bulk-build path.
            let row_map: BTreeMap<u32, V> = cols.into_iter().collect();
            len += row_map.len();
            by_row.insert(row, row_map);
        }
        RowMajorMap { by_row, len }
    }

    /// Drain into a row-major `(CellAddress, V)` iterator. Used by
    /// the structural-edit `relocate_cells` path that needs to
    /// rebuild the index under new keys.
    pub(crate) fn drain_into_vec(&mut self) -> Vec<(CellAddress, V)> {
        let mut out = Vec::with_capacity(self.len);
        let by_row = std::mem::take(&mut self.by_row);
        self.len = 0;
        for (row, cols) in by_row {
            for (col, value) in cols {
                out.push((CellAddress::new(row, col), value));
            }
        }
        out
    }
}

impl<V> Default for RowMajorMap<V> {
    fn default() -> Self {
        Self::new()
    }
}
