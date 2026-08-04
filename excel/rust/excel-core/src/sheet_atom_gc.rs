//! 不再被任何东西需要的原子怎么回收。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Get or create the primitive atom for a cell address.
    /// New cells start as Null.
    ///
    /// AUDIT B-2: this is the single atomization point. A `Plain` slot
    /// (lazily-installed bulk value) is promoted here — the parked value
    /// moves into a freshly-created store atom, preserving the value
    /// exactly so the downstream `store.set` equality dedup behaves as if
    /// the atom had existed all along.
    /// The ONLY create/destroy doors to the store for this sheet — they keep
    /// `atoms_owned` exact so per-sheet probes survive the P3 shared store.
    pub(crate) fn owned_create_atom(&self, value: Value) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_atom(value)
    }

    pub(crate) fn owned_create_derived(
        &self,
        read_fn: impl Fn(&dyn Fn(AtomId) -> Value) -> Value + 'static,
    ) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_derived(read_fn)
    }

    pub(crate) fn owned_destroy_atom(&self, id: AtomId) {
        if self.store.has_atom(id) {
            self.store.destroy_atom(id);
            self.atoms_owned.set(self.atoms_owned.get() - 1);
        }
    }

    pub(super) fn evict_owned_family_key<K>(&self, family: &Rc<RefCell<AtomFamily<K>>>, key: &K) -> bool
    where
        K: Eq + Hash + Clone,
    {
        if !family.borrow_mut().evict(&self.store, key) {
            return false;
        }
        self.atoms_owned.set(
            self.atoms_owned
                .get()
                .checked_sub(1)
                .expect("sheet family eviction underflow"),
        );
        true
    }

    /// Release Store dependency roots after their last formula-inner reader
    /// disappears. Evicting a formula facade can unmount its own inner, so
    /// continue iteratively through that inner's Store-recorded dependencies.
    /// AtomFamily refuses every node that still has a dependent/subscriber;
    /// this method never reconstructs or owns a parallel dependency graph.
    pub(super) fn try_evict_formula_dependency_atoms(&self, roots: impl IntoIterator<Item = AtomId>) {
        let mut pending: HashSet<AtomId> = roots.into_iter().collect();
        while !pending.is_empty() {
            let before = self.atoms_owned.get();
            let current: Vec<AtomId> = pending.drain().collect();

            for id in current {
                let cell_addr = { self.cell_facade_family.borrow().key_of(id).copied() };
                if let Some(addr) = cell_addr {
                    if self.evict_owned_family_key(&self.cell_facade_family, &addr) {
                        self.evict_owned_family_key(&self.slot_epoch_family, &addr);

                        let inner_id = { self.formula_inner_family.borrow().get(&addr) };
                        if let Some(inner_id) = inner_id {
                            let dependencies = self.store.direct_dependencies(inner_id);
                            if self.evict_owned_family_key(&self.formula_inner_family, &addr) {
                                pending.extend(dependencies);
                            }
                        }
                    } else {
                        // Another candidate in this pass may still own the
                        // final Store edge. Retry after that candidate peels.
                        pending.insert(id);
                    }
                    continue;
                }

                let band_key = { self.range_band_epoch_family.borrow().key_of(id).copied() };
                if let Some(key) = band_key {
                    if !self.evict_owned_family_key(&self.range_band_epoch_family, &key) {
                        pending.insert(id);
                    }
                    continue;
                }

                let column_key = { self.range_column_epoch_family.borrow().key_of(id).copied() };
                if let Some(key) = column_key {
                    if !self.evict_owned_family_key(&self.range_column_epoch_family, &key) {
                        pending.insert(id);
                    }
                    continue;
                }

                if self.range_sheet_epoch_family.borrow().key_of(id).is_some()
                    && !self.evict_owned_family_key(&self.range_sheet_epoch_family, &())
                {
                    pending.insert(id);
                }
            }

            // No Store node was released, so every remaining candidate is
            // still externally live and another pass cannot make progress.
            if self.atoms_owned.get() == before {
                return;
            }
        }
    }

    /// Reclaim the atomm nodes that existed solely to evaluate a formula that
    /// no longer owns `addr`. The direct dependency snapshot comes from Store;
    /// no sheet-local dependency graph is reconstructed here.
    pub(super) fn cleanup_obsolete_formula_atoms_at(&self, addr: CellAddress) {
        if self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.formula_source.borrow().contains_key(&addr)
        {
            return;
        }

        let inner_id = { self.formula_inner_family.borrow().get(&addr) };
        let dependencies = inner_id
            .map(|id| self.store.direct_dependencies(id))
            .unwrap_or_default();

        // A leaf formula facade can go first, severing its edge to the inner.
        // A facade still read by another formula/subscriber stays; the write's
        // epoch bump has already retargeted it away from the obsolete inner.
        self.evict_owned_family_key(&self.cell_facade_family, &addr);
        if inner_id.is_some() {
            self.evict_owned_family_key(&self.formula_inner_family, &addr);
        }

        if self.formula_inner_family.borrow().get(&addr).is_none() {
            self.try_evict_formula_dependency_atoms(dependencies);
        }
        self.evict_owned_family_key(&self.slot_epoch_family, &addr);
    }

    /// Structural edits can leave old address keys behind after storage has
    /// moved. Peel obsolete formula components until no further Store-safe
    /// family eviction is possible (chains may require more than one pass).
    pub(crate) fn prune_obsolete_formula_atoms(&self) {
        loop {
            let keys: Vec<CellAddress> = self
                .formula_inner_family
                .borrow()
                .iter()
                .map(|(addr, _)| *addr)
                .filter(|addr| {
                    !self.interior.formula_cells.borrow().contains_key(addr)
                        && !self.interior.formula_source.borrow().contains_key(addr)
                })
                .collect();
            if keys.is_empty() {
                return;
            }
            let before = self.atoms_owned.get();
            for addr in keys {
                self.cleanup_obsolete_formula_atoms_at(addr);
            }
            if self.atoms_owned.get() == before {
                return;
            }
        }
    }

    /// Full-sheet replacement temporarily has no live sheet content, so every
    /// removable family node is old-world state. Fixed-point peeling follows
    /// Store's actual edges and preserves any facade still read externally.
    pub(super) fn prune_all_family_atoms(&self) {
        loop {
            let before = self.atoms_owned.get();

            let facade_keys: Vec<CellAddress> = self
                .cell_facade_family
                .borrow()
                .iter()
                .map(|(key, _)| *key)
                .collect();
            for key in facade_keys {
                self.evict_owned_family_key(&self.cell_facade_family, &key);
            }

            let inner_keys: Vec<CellAddress> = self
                .formula_inner_family
                .borrow()
                .iter()
                .map(|(key, _)| *key)
                .collect();
            for key in inner_keys {
                self.evict_owned_family_key(&self.formula_inner_family, &key);
            }

            let epoch_keys: Vec<CellAddress> = self
                .slot_epoch_family
                .borrow()
                .iter()
                .map(|(key, _)| *key)
                .collect();
            for key in epoch_keys {
                self.evict_owned_family_key(&self.slot_epoch_family, &key);
            }

            let band_keys: Vec<RangeBandKey> = self
                .range_band_epoch_family
                .borrow()
                .iter()
                .map(|(key, _)| *key)
                .collect();
            for key in band_keys {
                self.evict_owned_family_key(&self.range_band_epoch_family, &key);
            }

            let column_keys: Vec<RangeColumnKey> = self
                .range_column_epoch_family
                .borrow()
                .iter()
                .map(|(key, _)| *key)
                .collect();
            for key in column_keys {
                self.evict_owned_family_key(&self.range_column_epoch_family, &key);
            }

            self.evict_owned_family_key(&self.range_sheet_epoch_family, &());

            if self.atoms_owned.get() == before {
                return;
            }
        }
    }

    pub(super) fn destroy_retired_atoms(&self, ids: Vec<AtomId>) {
        let mut pending: HashSet<AtomId> = ids.into_iter().collect();
        loop {
            let before = pending.len();
            pending.retain(|id| {
                if !self.store.has_atom(*id) {
                    return false;
                }
                if self.store.has_dependents(*id) || self.store.has_subscribers(*id) {
                    return true;
                }
                self.owned_destroy_atom(*id);
                false
            });
            if pending.is_empty() || pending.len() == before {
                break;
            }
        }
        debug_assert!(
            pending.is_empty(),
            "full sheet replacement retained {} old cell atom(s)",
            pending.len()
        );
    }
}
