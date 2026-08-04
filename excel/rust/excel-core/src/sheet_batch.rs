//! 批量写入的两个入口。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Set multiple cells at once, with a single propagation pass.
    ///
    /// Like `set_cell`, this also clears any existing formula on each target
    /// cell. Store publication is coalesced for the batch without eagerly
    /// computing formula values.
    pub fn batch_set(&mut self, updates: &[(&str, Value)]) {
        let parsed_updates: Vec<(CellAddress, Value)> = updates
            .iter()
            .map(|(addr_str, value)| {
                (
                    CellAddress::parse(addr_str).expect("invalid cell address"),
                    value.clone(),
                )
            })
            .collect();
        let written_addrs: Vec<CellAddress> =
            parsed_updates.iter().map(|(addr, _)| *addr).collect();
        let array_formulas_to_reproject =
            self.store_dependent_array_formula_addrs_from_addrs(written_addrs.iter().copied());

        // Snapshot pre-state for *every* subscribed address so we can fire
        // exactly once per actual value change at the end. The subset of
        // those addresses that are also being written get their fanouts
        // detached up front (so `store.set` doesn't double-fire); other
        // subscribed addresses keep their fanouts (their natural store
        // notification would suffice, but we suppress it too so we can
        // dedupe with the structural-style diff at the end).
        let subscribed: Vec<CellAddress> = self.cell_subscriptions.keys().copied().collect();
        let mut pre: Vec<(CellAddress, Value)> = Vec::with_capacity(subscribed.len());
        for addr in &subscribed {
            pre.push((*addr, self.peek_value(*addr)));
            self.detach_address_sub(*addr);
        }

        let mut atom_values: Vec<(AtomId, Value)> = Vec::with_capacity(parsed_updates.len());
        let mut pre_range_members: Vec<(CellAddress, bool)> =
            Vec::with_capacity(parsed_updates.len());
        let mut obsolete_formula_addrs = HashSet::new();
        let mut null_addrs = HashSet::new();

        for (addr, value) in parsed_updates {
            let pre_range_member = self.range_member_present(addr);
            pre_range_members.push((addr, pre_range_member));

            if self.interior.formula_cells.borrow().contains_key(&addr)
                || self.interior.needs_parse.borrow().contains(&addr)
            {
                obsolete_formula_addrs.insert(addr);
            }
            self.remove_formula_record(addr);

            let id = self.ensure_cell(addr);
            if matches!(value, Value::Null) {
                null_addrs.insert(addr);
            }
            atom_values.push((id, value));
        }

        self.store_batch(|sheet| {
            for (id, value) in atom_values {
                sheet.store.set(id, value);
            }
            for addr in &written_addrs {
                sheet.invalidate_formula_inner(*addr);
                sheet.bump_facade_epoch(*addr);
            }
            for (addr, pre_range_member) in pre_range_members {
                sheet.bump_range_epochs_if_membership_changed(addr, pre_range_member);
            }
        });
        for addr in null_addrs {
            self.try_release_primitive(addr);
        }
        for addr in obsolete_formula_addrs {
            self.cleanup_obsolete_formula_atoms_at(addr);
        }
        self.recompute_array_formulas_in(&array_formulas_to_reproject);

        for addr in &subscribed {
            self.attach_address_sub(*addr);
        }
        for (addr, pre_val) in pre {
            let post_val = self.peek_value(addr);
            if pre_val != post_val {
                self.notify_address_subscribers(addr);
            }
        }
    }

    // === LAZY_FORMULA_EVAL Step 3 — bulk import API ===

    /// Run `f` inside a Store batch. Writes performed through the `BulkLoader`
    /// update source atoms immediately, while derived propagation is coalesced
    /// until every write in the closure has landed. The loader then restores
    /// direct address subscriptions and publishes each changed address once.
    ///
    /// Use for CSV / JSON / xlsx import paths that write thousands of cells:
    /// the per-cell notify cost would dominate. Already-materialized formulas
    /// rederive once at batch flush; formulas never read remain unmaterialized.
    ///
    /// RAII shape: `BulkLoader` is not exposed outside the closure, so the
    /// flush always runs (no begin/end pair to forget).
    pub fn bulk_load<R>(&mut self, f: impl FnOnce(&mut BulkLoader<'_>) -> R) -> R {
        let store = self.store.clone();
        let mut loader = BulkLoader::new(self);
        let mut result = None;
        store.batch(|_| {
            result = Some(f(&mut loader));
        });
        loader.flush();
        result.expect("bulk-load closure did not run")
    }
}
