//! 批量安装期的存储预留与安装收尾。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// 全表替换留下的收尾工作，分两批、时机不同：
///
/// - `sub_addrs` —— 安装期间被摘掉 fanout 的订阅地址。投影做完之后统一重挂
///   并通知一次，仍在 Store 批次**内**（`finish_bulk_spill_projection`）。
/// - `retired_atom_ids` —— 旧存储原子。只能等整个 Store 批次冲刷完、跨表
///   依赖从旧图上摘干净之后再销毁（`finish_bulk_install`，批次**外**）。
///
/// 之所以要把"装存储"和"投影 + 通知"拆成两次调用，是**多表安装**逼出来的：
/// 一条读别的表的动态数组公式，必须等所有表的存储都落地之后再投影，否则它
/// 是拿旧世界算出来的几何，而且此后没有任何东西会来纠正它。
pub(crate) struct BulkInstallCleanup {
    pub(super) sub_addrs: Vec<CellAddress>,
    pub(super) retired_atom_ids: Vec<AtomId>,
}

impl Sheet {
    /// Pre-grow the formula-installation HashMaps to fit a hinted batch
    /// size. Called by `Workbook::bulk_load` flush after the loader's
    /// queue size is known, before the per-sheet replay drives 10k+
    /// `set_formula` calls.
    ///
    /// HashMap rehashing is O(n) at each capacity doubling — at 100k
    /// entries that's ~17 rehashes inside the `Sheet::bulk_load` hot
    /// loop, each copying every existing entry to a fresh backing
    /// allocation. On wasm32 those rehashes dominated the constant-
    /// factor in the chain workload because each backing-vec growth
    /// goes through linear-memory page allocation.
    ///
    /// `hint` is the additional batch size; the call expands enough
    /// headroom on top of whatever's already populated so a second
    /// batch lands without re-rehashing. `RowMajorMap` (which backs
    /// `formula_cells` and `cells`) is BTreeMap-based and gets no
    /// benefit from `reserve`; only the HashMap-backed indexes are
    /// warmed here.
    pub(crate) fn reserve_for_bulk_install(&mut self, hint: usize) {
        if hint == 0 {
            return;
        }
        self.interior.formula_exprs.borrow_mut().reserve(hint);
        self.interior.formula_texts.borrow_mut().reserve(hint);
    }

    /// STORAGE_PRIMARY Phase 6.1: full-sheet replace via direct map
    /// installs — "the storage IS the API". No per-cell parse, no dep
    /// extraction, no cycle check, no ops queue. Returns
    /// `(primitives_installed, formulas_installed)`.
    ///
    /// Semantics (per `docs/STORAGE_PRIMARY_PLAN.md` § "The right
    /// architecture"):
    ///
    ///   - Previous sheet content is fully torn down first (this is a
    ///     REPLACE, not a merge): primitive atoms are destroyed, every
    ///     hydrated-formula structure (`formula_cells` /
    ///     `formula_exprs` / `formula_texts`) is
    ///     cleared wholesale, lazy parking
    ///     (`formula_source` / `needs_parse`) is dropped, and spill
    ///     bookkeeping is reset. Wholesale clears — not per-record
    ///     edge removal — because the entire index family is being
    ///     rebuilt from scratch (lazily, on first read).
    ///   - Primitives: one `Store::create_atom` + `RowMajorMap::insert`
    ///     per cell. A true O(1) map swap is impossible here because
    ///     primitive values live behind atoms in `self.store`
    ///     (`cells` maps addr → `AtomId`, not addr → `Value`), so this
    ///     is O(n) iterate-insert — but each insert is a plain storage
    ///     write (~atom alloc + BTreeMap insert), with zero parse / dep
    ///     / notify work. `Value::Null` entries are skipped (Null means
    ///     "absent" — matches `set_cell`'s release contract).
    ///   - Formulas: parked as raw source text in `formula_source` with
    ///     every addr in `needs_parse` — exactly the Phase 2+3 lazy
    ///     state. `hydrate_formula` does parse / cycle-check / dep
    ///     install on first read, unchanged. NOTE: unlike
    ///     `BulkLoader::set_formula`, the source is NOT parse-validated
    ///     here (validation would defeat the storage-primary contract);
    ///     unparseable text surfaces `#VALUE!` at first read via the
    ///     hydrator's parse-failure arm, and `get_formula` /
    ///     `ISFORMULA` will see it as a live formula until then.
    ///   - An address present in BOTH maps resolves formula-wins
    ///     (mirrors the loader path, where a formula install drops the
    ///     primitive scaffold).
    ///   - Existing subscription buckets survive: their fanouts are
    ///     detached during the swap, reattached after, and every
    ///     subscribed address is notified once (the whole world
    ///     changed).
    ///
    pub(crate) fn bulk_install_storage(
        &mut self,
        primitives: HashMap<CellAddress, Value>,
        formulas: HashMap<CellAddress, String>,
    ) -> (usize, usize, BulkInstallCleanup) {
        self.bump_formula_topology_epoch();
        // --- Teardown of previous content ---------------------------------
        // Detach every subscription fanout first so atom destruction below
        // cannot fire through a stale store sub. Buckets (and their
        // listeners) stay; we reattach + notify at the end.
        let sub_addrs: Vec<CellAddress> = self.cell_subscriptions.keys().copied().collect();
        for addr in &sub_addrs {
            self.detach_address_sub(*addr);
        }

        // Retire every old cell atom as one graph. Spill targets are included
        // in `cells`; fixed-point destruction below naturally removes those
        // derived targets before their anchors.
        self.spill_targets.clear();
        self.spill_target_anchor.clear();
        self.spill_anchor_addr.clear();
        // ADR 0006 stage 0/2 — the blocked-anchor registry names addresses
        // whose formulas are about to be replaced wholesale, so it clears
        // on the same teardown as the three installed-spill maps. Both halves
        // (anchors and their rectangle claims) go together.
        self.clear_blocked_anchor_registry();
        let drained = self.interior.cells.borrow_mut().drain_into_vec();
        let retired_atom_ids: Vec<AtomId> = drained
            .into_iter()
            .filter_map(|(_, slot)| slot.atom_id())
            .collect();

        // Hydrated formula state — wholesale clears (full replace).
        *self.interior.formula_cells.borrow_mut() = RowMajorMap::new();
        self.interior.formula_exprs.borrow_mut().clear();
        self.interior.formula_texts.borrow_mut().clear();
        // Lazy parking from any previous bulk load.
        *self.interior.formula_source.borrow_mut() = RowMajorMap::new();
        self.interior.needs_parse.borrow_mut().clear();

        // With storage empty, peel every old-world AtomFamily component that
        // Store proves is unobserved. A facade retained by an external Store
        // reader stays alive and is retargeted to the new storage below.
        self.prune_all_family_atoms();

        // --- Primitive install ---------------------------------------------
        // AUDIT B-2 (FIXED): park raw values as `CellSlot::Plain` — zero
        // store-atom allocations. The atom materializes lazily at the
        // first `ensure_cell` (write / spill anchor) or subscription
        // attach for that address; pure reads serve the parked value
        // directly via `slot_value`, skipping the old addr → AtomId →
        // Value double lookup. The map itself is bulk-built from sorted
        // pairs (`from_unsorted_pairs`) instead of paying a random-order
        // BTreeMap insert per cell.
        let mut prim_pairs: Vec<(CellAddress, CellSlot)> = Vec::with_capacity(primitives.len());
        for (addr, value) in primitives {
            if matches!(value, Value::Null) {
                continue;
            }
            // Formula wins when the same addr appears in both maps.
            if formulas.contains_key(&addr) {
                continue;
            }
            prim_pairs.push((addr, CellSlot::Plain(value)));
        }
        let primitives_installed = prim_pairs.len();
        *self.interior.cells.borrow_mut() = RowMajorMap::from_unsorted_pairs(prim_pairs);

        // --- Formula parking (lazy — Phase 2+3 machinery) ------------------
        let formulas_installed = formulas.len();
        let mut needs: HashSet<CellAddress> = HashSet::with_capacity(formulas_installed);
        let mut formula_pairs: Vec<(CellAddress, ParkedFormula)> =
            Vec::with_capacity(formulas_installed);
        for (addr, text) in formulas {
            needs.insert(addr);
            formula_pairs.push((addr, ParkedFormula::new(text)));
        }
        *self.interior.formula_source.borrow_mut() =
            RowMajorMap::from_unsorted_pairs(formula_pairs);
        *self.interior.needs_parse.borrow_mut() = needs;
        self.imported_formula_count
            .set(self.imported_formula_count.get() + formulas_installed);

        // Only externally-observed family nodes can have survived the old-world
        // prune. Retarget those through their existing Store epochs now that
        // final storage is installed; untouched payload remains fully lazy.
        let surviving_inner_addrs: Vec<CellAddress> = self
            .formula_inner_family
            .borrow()
            .iter()
            .map(|(addr, _)| *addr)
            .collect();
        let surviving_epoch_addrs: Vec<CellAddress> = self
            .slot_epoch_family
            .borrow()
            .iter()
            .map(|(addr, _)| *addr)
            .collect();
        self.store_batch(|sheet| {
            for addr in surviving_inner_addrs {
                sheet.invalidate_formula_inner(addr);
            }
            for addr in surviving_epoch_addrs {
                sheet.bump_facade_epoch(addr);
            }
        });
        self.prune_all_family_atoms();

        // 投影与订阅通知不在这里做 —— 见 `BulkInstallCleanup` 的说明与
        // `finish_bulk_spill_projection`。存储到此为止就是最终态了。
        (
            primitives_installed,
            formulas_installed,
            BulkInstallCleanup {
                sub_addrs,
                retired_atom_ids,
            },
        )
    }

    /// 全表替换的第二步：装动态数组投影，然后重挂并通知订阅者。
    ///
    /// 与 `bulk_install_storage` 分开，是因为跨表数组公式只有在**所有**参与
    /// 安装的表都落地之后投影才是对的（`install_workbook_bulk` 因此先跑完
    /// 所有存储安装，再逐表跑这一步）。单表安装的调用方紧接着调用它，行为
    /// 与合并成一步时完全一致。
    ///
    /// 通知放在投影**之后**：订阅者要看到最终的溢出几何，而不是投影到一半
    /// 的表。
    pub(crate) fn finish_bulk_spill_projection(&mut self, cleanup: &BulkInstallCleanup) {
        self.install_bulk_spill_projections();

        // Every subscribed address is notified exactly once: a full-sheet
        // replace means any watched cell may have changed. Bounded by the
        // (small) subscription count, not by payload size.
        for &addr in &cleanup.sub_addrs {
            self.attach_address_sub(addr);
            if self.has_address_subscribers(addr) {
                self.notify_address_subscribers(addr);
            }
        }
    }

    /// 全表替换后，这张表上仍可能被**别的表**读到的全部 Store 根原子。
    ///
    /// 就是 6 个 `AtomFamily` 里还活着的节点。全表替换会把无人观察的家族节点
    /// 整体剪掉（`prune_all_family_atoms` 前后跑了两遍），所以剩下的正好是
    /// "有外部读者的那一小撮" —— 规模由被观察面决定，不随载荷大小增长。
    ///
    /// 这不是新索引。它读的是 Store 自己的原子表，交给
    /// `Store::reverse_dependents` 之后，决定"谁要重算"的仍然是 Store 依赖图。
    /// 与 `store_root_atoms_for_addr` 同形，只是把"一个地址"放大成"整张表"。
    pub(crate) fn store_root_atoms_after_bulk_install(&self) -> Vec<AtomId> {
        let mut out = Vec::new();
        let push_live = |id: AtomId, out: &mut Vec<AtomId>| {
            if self.store.has_atom(id) {
                out.push(id);
            }
        };
        for (_, id) in self.slot_epoch_family.borrow().iter() {
            push_live(id, &mut out);
        }
        for (_, id) in self.cell_facade_family.borrow().iter() {
            push_live(id, &mut out);
        }
        for (_, id) in self.formula_inner_family.borrow().iter() {
            push_live(id, &mut out);
        }
        for (_, id) in self.range_band_epoch_family.borrow().iter() {
            push_live(id, &mut out);
        }
        for (_, id) in self.range_column_epoch_family.borrow().iter() {
            push_live(id, &mut out);
        }
        for (_, id) in self.range_sheet_epoch_family.borrow().iter() {
            push_live(id, &mut out);
        }
        out
    }

    /// Finish a full-sheet replacement after the enclosing Store transaction
    /// has published and refreshed every dependent formula.
    pub(crate) fn finish_bulk_install(&self, cleanup: BulkInstallCleanup) {
        self.prune_all_family_atoms();
        self.destroy_retired_atoms(cleanup.retired_atom_ids);
        self.prune_all_family_atoms();
    }
}
