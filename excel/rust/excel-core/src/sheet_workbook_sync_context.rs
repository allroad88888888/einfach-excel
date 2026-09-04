//! 工作簿拓扑、名称、表与自定义函数的同步读取。

use super::*;

impl WorkbookAtomContext {
    pub(super) fn bump_epoch(&self, slot: &RefCell<Option<AtomId>>, revision: &Cell<u64>) {
        let next = revision.get().wrapping_add(1);
        revision.set(next);
        let id = *slot.borrow();
        if let Some(id) = id {
            self.store.set(id, Value::Number(next as f64));
        }
    }

    pub(crate) fn sync_topology(&self, sheets: Vec<(String, FacadeCtx)>) {
        let by_name = sheets
            .iter()
            .enumerate()
            .map(|(idx, (name, _))| (name.clone(), idx))
            .collect();
        *self.topology.borrow_mut() = WorkbookAtomTopology { sheets, by_name };
        self.bump_epoch(&self.topology_epoch, &self.topology_revision);
    }

    pub(crate) fn sync_names(&self, names: HashMap<String, Value>) {
        *self.names.borrow_mut() = names;
        self.bump_epoch(&self.names_epoch, &self.names_revision);
    }

    /// Refresh the structured-reference Table projection (design doc #32
    /// §5.3). Called by `Workbook` after every Table registry mutation.
    ///
    /// Only replaces the projection snapshot; the paired reactive
    /// `store.set(tables_epoch, +1)` that re-derives dependent formulas is
    /// `bump_tables_epoch`, kept separate so `Workbook` can sync the
    /// projection BEFORE it rewrites referencing formulas (rename) and fire
    /// the epoch AFTER.
    pub(crate) fn sync_tables(&self, tables: HashMap<String, ProjectedTable>) {
        *self.tables.borrow_mut() = tables;
    }

    /// Resolve a named structured reference (`Table1[...]`). `None` when no
    /// Table is registered under `name`, or its anchor sheet is gone.
    pub(super) fn lookup_table_named(&self, name: &str, args: &ReadArgs) -> Option<ResolvedTable> {
        // Register the geometry/name epoch edge BEFORE the registry probe so
        // even a miss (`#NAME?`) re-derives once the Table is later created.
        self.depend_tables(args);
        let table = self
            .tables
            .borrow()
            .get(&name.to_ascii_uppercase())
            .cloned()?;
        // Tracked topology read: cross-sheet resolution depends on the
        // sheet-name → index map, so re-derive if a sheet is added/removed.
        self.depend_topology(args);
        let sheet_index = self
            .topology
            .borrow()
            .by_name
            .get(&table.sheet_name)
            .copied()?;
        Some(table.to_resolved(sheet_index))
    }

    /// Resolve a table-less structured reference (`[Col]` / `[@Col]`): the
    /// Table on `sheet_index` whose range contains `addr`. `None` when the
    /// cell is inside no Table.
    pub(super) fn lookup_table_containing(
        &self,
        sheet_index: usize,
        addr: CellAddress,
        args: &ReadArgs,
    ) -> Option<ResolvedTable> {
        // See `lookup_table_named`: register the epoch edge before the probe
        // so a table-less `[Col]` re-derives once a Table wraps its cell.
        self.depend_tables(args);
        self.depend_topology(args);
        let sheet_name = self
            .topology
            .borrow()
            .sheets
            .get(sheet_index)
            .map(|(name, _)| name.clone())?;
        let tables = self.tables.borrow();
        tables
            .values()
            .find(|t| t.sheet_name == sheet_name && t.range.contains(addr))
            .map(|t| t.to_resolved(sheet_index))
    }

    pub(crate) fn set_custom_functions(
        &self,
        registry: Option<Arc<dyn CustomFunctionRegistry>>,
        invalidate: bool,
    ) {
        *self.custom_functions.borrow_mut() = registry;
        if invalidate {
            // Registry changed: every memoized async result is stale. Reset
            // each result atom back to #BUSY! in place (atom identity is
            // stable; dependents re-derive without rekeying), drop the queue
            // and call_id index, and bump the generation so in-flight settles
            // from the old registry are discarded. One batch with the epoch
            // bump so consumers see a single consistent flush.
            let atoms: Vec<AtomId> = {
                let mut state = self.async_custom.borrow_mut();
                state.generation = state.generation.wrapping_add(1);
                state.pending.clear();
                state.by_call_id.clear();
                state.entries.values().map(|e| e.atom).collect()
            };
            self.store.batch(|store| {
                for atom in atoms {
                    store.set(atom, Value::Error(ValueError::Busy));
                }
            });
            self.bump_epoch(&self.custom_epoch, &self.custom_revision);
        }
    }

    /// Drain the async custom-formula request queue. Called by the host
    /// after every mutation entry point returns (never during evaluation).
    /// Also the opportunistic moment to enforce the result-cache cap.
    pub(super) fn resolve_sheet(&self, name: &str, args: &ReadArgs) -> Option<(usize, FacadeCtx)> {
        self.depend_topology(args);
        let topology = self.topology.borrow();
        let idx = topology.by_name.get(name).copied()?;
        Some((idx, topology.sheets.get(idx)?.1.clone()))
    }

    pub(super) fn sheet_count(&self, args: &ReadArgs) -> usize {
        self.depend_topology(args);
        self.topology.borrow().sheets.len()
    }

    pub(super) fn lookup_named(&self, name: &str, args: &ReadArgs) -> Option<Value> {
        self.depend_names(args);
        self.names.borrow().get(&name.to_ascii_uppercase()).cloned()
    }

    pub(super) fn call_custom(
        &self,
        name: &str,
        values: &[Value],
        args: &ReadArgs,
    ) -> Option<Value> {
        self.depend_custom(args);
        let registry = self.custom_functions.borrow().clone()?;
        if args.is_faulted() {
            // Speculative (faulted) run: no side effects — neither the sync
            // JS callback nor async memo-entry creation/enqueue. The retry
            // run that can commit does the real work.
            return Some(Value::Null);
        }
        if registry.is_async(name) {
            return Some(self.async_custom_result(name, values, args));
        }
        let _scope = crate::workbook::CustomCallScope::enter(&self.custom_call_depth);
        registry.lookup(name, values)
    }
}
