//! 结构编辑时单元格数据按新坐标搬家。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    pub(super) fn drop_cells_in(&mut self, pred: impl Fn(CellAddress) -> bool) {
        // Codex P1 #2 fix: collect EVERY address in the deleted band
        // across the four cell/formula maps — primitive cells, hydrated
        // formula records, AND lazy parked formulas
        // (`formula_source` / `needs_parse`). The pre-fix version only
        // walked `interior.cells.keys()`, so lazy-only entries inside the
        // band survived `drop_cells_in` and were later relocated through
        // `f(addr)` into `REF_INVALID_*` sentinels, where they panic
        // `non_empty_addrs()` (cell.rs:58 add overflow on `row + 1`).
        let mut to_drop: HashSet<CellAddress> = HashSet::new();
        to_drop.extend(self.interior.cells.borrow().keys().filter(|a| pred(*a)));
        // `HashMap::keys` yields `&CellAddress`; `RowMajorMap::keys` yields
        // owned `CellAddress`. Normalise both with copied().
        to_drop.extend(
            self.interior
                .formula_cells
                .borrow()
                .keys()
                .filter(|a| pred(*a)),
        );
        to_drop.extend(
            self.interior
                .formula_source
                .borrow()
                .keys()
                .filter(|a| pred(*a)),
        );
        for addr in to_drop {
            self.drop_cell_slot(addr);
            // `remove_formula_record` already drains `formula_source` +
            // `needs_parse` first (LAZY_FORMULA_INDEXING Phase 3) so a
            // lazy-only entry is cleaned up even though no eager record
            // exists for it.
            self.remove_formula_record(addr);
            self.invalidate_formula_inner(addr);
            self.bump_facade_epoch(addr);
            // Fanout reattach + per-address fire are handled by the enclosing
            // `with_structural_edit`; nothing to do here.
        }
        // Phase 6 — formats shift alongside cells. Drop formats whose
        // addresses fall inside the deleted band; survivors are relocated by
        // `relocate_cells`. Done as a separate sweep so the existing cell
        // logic stays unchanged.
        let fmt_drop: Vec<CellAddress> =
            self.formats.keys().copied().filter(|a| pred(*a)).collect();
        for addr in fmt_drop {
            self.formats.remove(&addr);
        }
    }

    /// Move every (still-present) cell entry to its new address per `f`.
    pub(crate) fn relocate_cells(&mut self, f: impl Fn(CellAddress) -> CellAddress) {
        // Phase A: rebuild each map under new keys. We materialize Vecs first
        // because mutating a BTreeMap while iterating its keys would panic.
        // `drain_into_vec` empties `interior.cells` / `interior.formula_cells`
        // and hands back row-major (addr, value) pairs we reinsert under the
        // shifted addresses. P4a borrow rule: each drain lands in an owned
        // `Vec` in its own statement, so no `interior` borrow is held
        // across the rebuild loops.
        let mut changed_addrs: HashSet<CellAddress> = HashSet::new();
        let mut new_cells: RowMajorMap<CellSlot> = RowMajorMap::new();
        let drained_cells = self.interior.cells.borrow_mut().drain_into_vec();
        for (addr, slot) in drained_cells {
            let next = f(addr);
            if next != addr {
                changed_addrs.insert(addr);
                changed_addrs.insert(next);
            }
            new_cells.insert(next, slot);
        }
        let mut new_formula_cells: RowMajorMap<Rc<FormulaRecord>> = RowMajorMap::new();
        let drained_formula_cells = self.interior.formula_cells.borrow_mut().drain_into_vec();
        for (addr, record) in drained_formula_cells {
            let next = f(addr);
            if next != addr {
                changed_addrs.insert(addr);
                changed_addrs.insert(next);
            }
            new_formula_cells.insert(next, record);
        }
        let new_formula_exprs: HashMap<CellAddress, Rc<Expr>> =
            std::mem::take(&mut *self.interior.formula_exprs.borrow_mut())
                .into_iter()
                .map(|(addr, expr)| {
                    let next = f(addr);
                    if next != addr {
                        changed_addrs.insert(addr);
                        changed_addrs.insert(next);
                    }
                    (next, expr)
                })
                .collect();
        let new_formula_texts: HashMap<CellAddress, String> =
            std::mem::take(&mut *self.interior.formula_texts.borrow_mut())
                .into_iter()
                .map(|(addr, text)| {
                    let next = f(addr);
                    if next != addr {
                        changed_addrs.insert(addr);
                        changed_addrs.insert(next);
                    }
                    (next, text)
                })
                .collect();
        // LAZY_FORMULA_INDEXING Phase 3: relocate parked lazy formula
        // entries too. `formula_source` is keyed by addr; `needs_parse`
        // is a set of addrs. Both get the same shift.
        let mut new_formula_source: RowMajorMap<ParkedFormula> = RowMajorMap::new();
        let drained_formula_source = self.interior.formula_source.borrow_mut().drain_into_vec();
        for (addr, src) in drained_formula_source {
            let next = f(addr);
            if next != addr {
                changed_addrs.insert(addr);
                changed_addrs.insert(next);
            }
            new_formula_source.insert(next, src);
        }
        let new_needs_parse: HashSet<CellAddress> =
            std::mem::take(&mut *self.interior.needs_parse.borrow_mut())
                .into_iter()
                .map(|addr| {
                    let next = f(addr);
                    if next != addr {
                        changed_addrs.insert(addr);
                        changed_addrs.insert(next);
                    }
                    next
                })
                .collect();
        // Phase 6 — formats follow the same shift as cells so a format set
        // on A1 survives a row insert above and re-emerges on A2. Entries
        // mapped onto the invalid sentinel (deleted band) are dropped; for
        // delete_row/delete_col `drop_cells_in` already removed them, but
        // we filter defensively here too in case `f` produces a sentinel.
        let new_formats: HashMap<CellAddress, CellFormat> = std::mem::take(&mut self.formats)
            .into_iter()
            .filter_map(|(addr, fmt)| {
                let next = f(addr);
                if next.row == crate::shift::REF_INVALID_ROW
                    || next.col == crate::shift::REF_INVALID_COL
                {
                    None
                } else {
                    Some((next, fmt))
                }
            })
            .collect();
        let new_range_formats: Vec<RangeFormat> = std::mem::take(&mut self.range_formats)
            .into_iter()
            .filter_map(|layer| {
                let start = f(layer.range.start);
                let end = f(layer.range.end);
                if start.row == crate::shift::REF_INVALID_ROW
                    || start.col == crate::shift::REF_INVALID_COL
                    || end.row == crate::shift::REF_INVALID_ROW
                    || end.col == crate::shift::REF_INVALID_COL
                {
                    None
                } else {
                    Some(RangeFormat {
                        range: CellRange::new(start, end).normalize(),
                        fmt: layer.fmt,
                    })
                }
            })
            .collect();
        *self.interior.cells.borrow_mut() = new_cells;
        *self.interior.formula_cells.borrow_mut() = new_formula_cells;
        *self.interior.formula_exprs.borrow_mut() = new_formula_exprs;
        *self.interior.formula_texts.borrow_mut() = new_formula_texts;
        *self.interior.formula_source.borrow_mut() = new_formula_source;
        *self.interior.needs_parse.borrow_mut() = new_needs_parse;
        self.formats = new_formats;
        self.range_formats = new_range_formats;
        for addr in changed_addrs {
            self.invalidate_formula_inner(addr);
            self.bump_facade_epoch(addr);
        }
        // Formula dependency edges need no address-index rebuild. Retargeting
        // below invalidates affected formula-inner/facade atoms; their next
        // Store read records the remapped dependencies.
    }
}
