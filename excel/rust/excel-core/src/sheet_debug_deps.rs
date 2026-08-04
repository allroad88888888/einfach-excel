//! 依赖图规模的调试口径。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Aggregate dep-graph statistics produced by
/// `Sheet::debug_dep_graph_stats` (Phase 1 of the lazy-formula-indexing
/// arc). One per sheet; the workbook-level probe in `WasmWorkbook`
/// sums these across all sheets and computes derived metrics
/// (avg_fanout) on the JS side.
///
/// All counters are `u64` so summing across sheets in the workbook
/// probe can't overflow even at multi-million formula scale.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct DepGraphStats {
    /// Number of formula records in this sheet (`formula_cells.len()`).
    pub formula_count: u64,
    /// Legacy point-dep edge count. Same-sheet point edges are now owned
    /// by the atom store, so this stays zero after the P4c flip.
    pub total_point_dep_edges: u64,
    /// Number of materialized Tier-B range geometry roots. These are Store
    /// primitives (band, column, or sheet epochs), never formula fanout edges.
    pub total_range_dep_entries: u64,
    /// Legacy same-sheet point fanout. Store-owned point edges are not
    /// counted by this sheet-level probe.
    pub max_fanout: u32,
    /// Number of hydrated formula records whose static range metadata is
    /// non-empty. This is parser/structure metadata, not reactive fanout.
    pub range_formula_count: u64,
}

impl Sheet {
    /// Number of formulas that currently depend on the cell at `addr`.
    #[doc(hidden)]
    pub fn debug_dependents_count(&self, addr_str: &str) -> usize {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return 0;
        };
        let mut roots = Vec::new();
        self.store_root_atoms_for_addr_into(addr, &mut roots);
        self.store_dependent_formula_addrs_from_atoms(&roots).len()
    }

    /// Number of materialized Store geometry roots used by large range
    /// formulas. Small ranges depend on member facades directly and therefore
    /// contribute zero here.
    #[doc(hidden)]
    pub fn debug_range_dep_count(&self) -> usize {
        self.range_band_epoch_family.borrow().len()
            + self.range_column_epoch_family.borrow().len()
            + self.range_sheet_epoch_family.borrow().len()
    }

    /// Number of already-materialized Store geometry roots touched by an
    /// address (row band, column, and/or sheet-wide root). This is a
    /// non-creating lookup.
    #[doc(hidden)]
    pub fn debug_range_dep_candidates(&self, addr_str: &str) -> usize {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return 0;
        };
        let mut roots = Vec::new();
        self.store_root_range_geometry_atoms_for_addr_into(addr, &mut roots);
        roots.len()
    }

    /// Count how many cells the sparse range-iterator visits when scanning
    /// `range_spec` (e.g. `"A1:AA50"`). Probe-only helper used by the
    /// Phase 2 scale acceptance test `range_read_1m_sparse_visits_only_range`
    /// — counts every non-empty cell yielded by `for_each_sparse_cell_with`,
    /// independent of `cells` HashMap total size.
    ///
    /// Phase 1 implementation: linear scan of `cells` + `formula_cells`
    /// filtered by `range.contains`, so this counter == "cells in range".
    /// Phase 2 (Agent F) swaps `cells` for a row-indexed structure and the
    /// visit-count contract becomes O(cells in range), not O(total cells).
    /// Returns 0 for an unparsable `range_spec`.
    #[doc(hidden)]
    pub fn debug_range_visit_count(&self, range_spec: &str) -> usize {
        let mut parts = range_spec.split(':');
        let (Some(start_s), Some(end_s), None) = (parts.next(), parts.next(), parts.next()) else {
            return 0;
        };
        let (Some(start), Some(end)) = (CellAddress::parse(start_s), CellAddress::parse(end_s))
        else {
            return 0;
        };
        let range = CellRange::new(start, end);
        let mut visits: usize = 0;
        self.for_each_sparse_cell_with(
            range,
            &|sheet, addr| sheet.peek_value(addr),
            &mut |_addr, _v| {
                visits += 1;
            },
        );
        visits
    }

    /// Compatibility stats probe. Reports hydrated formula/static-range
    /// metadata and Store geometry-root counts so bench/trace tooling can
    /// quantify materialization. Legacy point-fanout fields stay zero.
    ///
    /// Costs O(hydrated formula count), suitable only for diagnostics.
    #[doc(hidden)]
    pub fn debug_dep_graph_stats(&self) -> DepGraphStats {
        let total_range_entries = self.debug_range_dep_count() as u64;
        // Count hydrated formula records with static range metadata. This is
        // structural information, not reactive fanout.
        //
        // LAZY_FORMULA_INDEXING Phase 3: unhydrated formulas are not counted
        // here because their static metadata has not been installed yet.
        let range_formula_count = self
            .interior
            .formula_cells
            .borrow()
            .values()
            .filter(|record| !record.static_ranges.borrow().is_empty())
            .count() as u64;

        DepGraphStats {
            // `formula_count` reflects HYDRATED formulas only so the
            // stats probe surfaces how much formula state is materialized.
            // The total formula count (hydrated +
            // lazy) is exposed via `debug_formula_count`.
            formula_count: self.interior.formula_cells.borrow().len() as u64,
            total_point_dep_edges: 0,
            total_range_dep_entries: total_range_entries,
            max_fanout: 0,
            range_formula_count,
        }
    }

    /// Number of addresses in the deleted point-dependency index. Kept
    /// as a compatibility probe for older scale tests; always zero now
    /// that same-sheet point formulas delegate through atom edges.
    #[doc(hidden)]
    pub fn debug_point_dependency_key_count(&self) -> usize {
        0
    }
}
