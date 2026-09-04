//! 从 Store 反向依赖解析受影响公式。

use super::*;

impl Sheet {
    pub(super) fn formula_deps_for(expr: &Expr) -> HashSet<CellAddress> {
        let mut deps = Vec::new();
        collect_refs(expr, &mut deps);
        deps.into_iter().collect()
    }

    pub(super) fn store_root_atoms_for_addr_into(&self, addr: CellAddress, out: &mut Vec<AtomId>) {
        if let Some(id) = self.slot_atom_id(addr) {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }

        let epoch_id = { self.slot_epoch_family.borrow().get(&addr) };
        if let Some(id) = epoch_id {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }

        let facade_id = { self.cell_facade_family.borrow().get(&addr) };
        if let Some(id) = facade_id {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }

        self.store_root_range_geometry_atoms_for_addr_into(addr, out);
    }

    pub(crate) fn store_root_atoms_for_addr(&self, addr: CellAddress) -> Vec<AtomId> {
        let mut roots = Vec::new();
        self.store_root_atoms_for_addr_into(addr, &mut roots);
        roots
    }

    pub(crate) fn array_formula_addrs_for_store_atoms(
        &self,
        atom_ids: &[AtomId],
    ) -> HashSet<CellAddress> {
        let formula_inner_family = self.formula_inner_family.borrow();
        atom_ids
            .iter()
            .filter_map(|id| formula_inner_family.key_of(*id).copied())
            .filter(|addr| self.formula_needs_spill_maintenance(*addr))
            .collect()
    }

    pub(super) fn store_root_range_geometry_atoms_for_addr_into(
        &self,
        addr: CellAddress,
        out: &mut Vec<AtomId>,
    ) {
        let band_key = range_band_key_for_addr(addr);
        let band_id = { self.range_band_epoch_family.borrow().get(&band_key) };
        if let Some(id) = band_id {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }

        let column_key = RangeColumnKey { col: addr.col };
        let column_id = { self.range_column_epoch_family.borrow().get(&column_key) };
        if let Some(id) = column_id {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }

        let sheet_id = { self.range_sheet_epoch_family.borrow().get(&()) };
        if let Some(id) = sheet_id {
            if self.store.has_atom(id) {
                out.push(id);
            }
        }
    }

    pub(super) fn store_dependent_formula_addrs_from_atoms(
        &self,
        root_atoms: &[AtomId],
    ) -> HashSet<CellAddress> {
        if root_atoms.is_empty() {
            return HashSet::new();
        }
        let dependent_atoms = self.store.reverse_dependents(root_atoms);
        {
            let formula_inner_family = self.formula_inner_family.borrow();
            dependent_atoms
                .into_iter()
                .filter_map(|id| formula_inner_family.key_of(id).copied())
                .collect()
        }
    }

    pub(super) fn store_dependent_formula_addrs_from_addrs<I>(
        &self,
        addrs: I,
    ) -> HashSet<CellAddress>
    where
        I: IntoIterator<Item = CellAddress>,
    {
        let mut roots = Vec::new();
        for addr in addrs {
            self.store_root_atoms_for_addr_into(addr, &mut roots);
        }
        let formulas = self.store_dependent_formula_addrs_from_atoms(&roots);
        self.reverse_dep_visit_count.set(
            self.reverse_dep_visit_count
                .get()
                .saturating_add(formulas.len() as u64),
        );
        formulas
    }

    pub(super) fn store_dependent_array_formula_addrs_from_addrs<I>(
        &self,
        addrs: I,
    ) -> HashSet<CellAddress>
    where
        I: IntoIterator<Item = CellAddress>,
    {
        self.store_dependent_formula_addrs_from_addrs(addrs)
            .into_iter()
            .filter(|addr| self.formula_needs_spill_maintenance(*addr))
            .collect()
    }
}
