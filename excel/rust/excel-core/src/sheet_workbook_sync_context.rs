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

    pub(crate) fn sync_topology(&self, sheets: Vec<(String, FacadeCtx)>, keys: &[u64]) {
        let by_name = sheets
            .iter()
            .enumerate()
            .map(|(idx, (name, _))| (name.clone(), idx))
            .collect();
        let by_key = keys
            .iter()
            .enumerate()
            .map(|(idx, key)| (*key, idx))
            .collect();
        *self.topology.borrow_mut() = WorkbookAtomTopology {
            sheets,
            keys: keys.to_vec(),
            by_name,
            by_key,
        };
        self.bump_epoch(&self.topology_epoch, &self.topology_revision);
    }

    pub(crate) fn sync_scoped_names(
        &self,
        names: HashMap<String, crate::workbook::NamedDefinition>,
        sheet_names: HashMap<(u64, String), crate::workbook::NamedDefinition>,
    ) {
        *self.names.borrow_mut() = names;
        *self.sheet_names.borrow_mut() = sheet_names;
        self.bump_epoch(&self.names_epoch, &self.names_revision);
    }

    pub(crate) fn name_dependent_atoms(&self) -> Vec<AtomId> {
        self.names_epoch
            .borrow()
            .map_or_else(Vec::new, |root| self.store.reverse_dependents(&[root]))
    }

    pub(crate) fn table_dependent_atoms(&self) -> Vec<AtomId> {
        self.tables_epoch
            .borrow()
            .map_or_else(Vec::new, |root| self.store.reverse_dependents(&[root]))
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
        let idx = topology.by_name.get(name).copied().or_else(|| {
            topology.sheets.iter().position(|(s, _)| {
                s.eq_ignore_ascii_case(name) || s.to_lowercase() == name.to_lowercase()
            })
        })?;
        Some((idx, topology.sheets.get(idx)?.1.clone()))
    }

    pub(super) fn resolve_sheet_span(
        &self,
        start_sheet: &str,
        end_sheet: &str,
        args: &ReadArgs,
    ) -> Option<Vec<(usize, FacadeCtx)>> {
        self.depend_topology(args);
        let topology = self.topology.borrow();
        let find_idx = |target: &str| -> Option<usize> {
            topology.by_name.get(target).copied().or_else(|| {
                topology.sheets.iter().position(|(s, _)| {
                    s.eq_ignore_ascii_case(target) || s.to_lowercase() == target.to_lowercase()
                })
            })
        };
        let idx_a = find_idx(start_sheet)?;
        let idx_b = find_idx(end_sheet)?;
        let low = idx_a.min(idx_b);
        let high = idx_a.max(idx_b);
        Some(
            (low..=high)
                .filter_map(|idx| topology.sheets.get(idx).map(|(_, ctx)| (idx, ctx.clone())))
                .collect(),
        )
    }

    pub(super) fn resolve_sheet_by_index(&self, idx: usize, args: &ReadArgs) -> Option<FacadeCtx> {
        self.depend_topology(args);
        self.topology
            .borrow()
            .sheets
            .get(idx)
            .map(|(_, ctx)| ctx.clone())
    }

    pub(super) fn sheet_count(&self, args: &ReadArgs) -> usize {
        self.depend_topology(args);
        self.topology.borrow().sheets.len()
    }

    fn resolve_scoped_definition(
        &self,
        sheet_idx: Option<usize>,
        name: &str,
        args: &ReadArgs,
    ) -> Option<(Option<usize>, crate::workbook::NamedDefinition)> {
        self.depend_names(args);
        let key = name.to_uppercase();
        if let Some(idx) = sheet_idx {
            self.depend_topology(args);
            if let Some(&sk) = self.topology.borrow().keys.get(idx) {
                if let Some(def) = self.sheet_names.borrow().get(&(sk, key.clone())).cloned() {
                    return Some((Some(idx), def));
                }
            }
        }
        self.names.borrow().get(&key).cloned().map(|def| (None, def))
    }

    fn resolve_sheet_qualified_definition(
        &self,
        sheet_name: &str,
        name: &str,
        args: &ReadArgs,
    ) -> Result<Option<(usize, crate::workbook::NamedDefinition)>, ValueError> {
        self.depend_names(args);
        let Some((idx, _)) = self.resolve_sheet(sheet_name, args) else {
            return Err(ValueError::InvalidRef);
        };
        let key = name.to_uppercase();
        let sk = self.topology.borrow().keys[idx];
        if let Some(def) = self.sheet_names.borrow().get(&(sk, key.clone())).cloned() {
            return Ok(Some((idx, def)));
        }
        Ok(self.names.borrow().get(&key).cloned().map(|def| (idx, def)))
    }

    pub(super) fn lookup_sheet_scoped_value(
        &self,
        sheet_idx: usize,
        name: &str,
        args: &ReadArgs,
    ) -> Option<Option<Value>> {
        self.depend_names(args);
        self.depend_topology(args);
        let sk = *self.topology.borrow().keys.get(sheet_idx)?;
        let def = self
            .sheet_names
            .borrow()
            .get(&(sk, name.to_uppercase()))?
            .clone();
        Some(match def {
            crate::workbook::NamedDefinition::Value(value) => Some(value),
            _ => None,
        })
    }

    pub(super) fn lookup_named(&self, name: &str, args: &ReadArgs) -> Option<Value> {
        self.depend_names(args);
        match self.names.borrow().get(&name.to_uppercase())? {
            crate::workbook::NamedDefinition::Value(value) => Some(value.clone()),
            crate::workbook::NamedDefinition::CustomFormula(definition) => Some(definition.lambda_value(|name|
                matches!(self.names.borrow().get(name), Some(crate::workbook::NamedDefinition::CustomFormula(_))))),
            crate::workbook::NamedDefinition::Range { .. }
            | crate::workbook::NamedDefinition::Formula { .. } => None,
        }
    }

    pub(super) fn lookup_sheet_named(
        &self,
        sheet_name: &str,
        name: &str,
        args: &ReadArgs,
    ) -> Result<Option<Value>, ValueError> {
        let Some((_, def)) = self.resolve_sheet_qualified_definition(sheet_name, name, args)? else {
            return Ok(None);
        };
        Ok(match def {
            crate::workbook::NamedDefinition::Value(value) => Some(value),
            crate::workbook::NamedDefinition::CustomFormula(definition) => Some(definition.lambda_value(|n|
                matches!(self.names.borrow().get(n), Some(crate::workbook::NamedDefinition::CustomFormula(_))))),
            crate::workbook::NamedDefinition::Range { .. }
            | crate::workbook::NamedDefinition::Formula { .. } => None,
        })
    }

    pub(super) fn lookup_scoped_named_range(
        &self,
        sheet_idx: Option<usize>,
        name: &str,
        args: &ReadArgs,
    ) -> Result<Option<(String, CellRange)>, ValueError> {
        let Some((_, definition)) = self.resolve_scoped_definition(sheet_idx, name, args) else {
            return Ok(None);
        };
        self.range_from_definition(definition, args)
    }

    pub(super) fn lookup_sheet_named_range(
        &self,
        sheet_name: &str,
        name: &str,
        args: &ReadArgs,
    ) -> Result<Option<(String, CellRange)>, ValueError> {
        let Some((_, definition)) = self.resolve_sheet_qualified_definition(sheet_name, name, args)? else {
            return Ok(None);
        };
        self.range_from_definition(definition, args)
    }

    fn range_from_definition(
        &self,
        definition: crate::workbook::NamedDefinition,
        args: &ReadArgs,
    ) -> Result<Option<(String, CellRange)>, ValueError> {
        let crate::workbook::NamedDefinition::Range { sheet_key, range } = definition else {
            return Ok(None);
        };
        self.depend_topology(args);
        let topology = self.topology.borrow();
        let index = topology
            .by_key
            .get(&sheet_key)
            .ok_or(ValueError::InvalidRef)?;
        Ok(Some((
            topology.sheets[*index].0.clone(),
            range.ok_or(ValueError::InvalidRef)?,
        )))
    }

    pub(super) fn lookup_named_formula(
        &self,
        sheet_idx: Option<usize>,
        sheet_name: Option<&str>,
        name: &str,
        args: &ReadArgs,
    ) -> Result<Option<(Option<usize>, Option<String>, Rc<Expr>)>, ValueError> {
        let resolved = match sheet_name {
            Some(sn) => self
                .resolve_sheet_qualified_definition(sn, name, args)?
                .map(|(idx, def)| (Some(idx), def)),
            None => self.resolve_scoped_definition(sheet_idx, name, args),
        };
        let Some((scope_idx, crate::workbook::NamedDefinition::Formula { expr, .. })) = resolved
        else {
            return Ok(None);
        };
        self.depend_topology(args);
        let scope_name = scope_idx.and_then(|idx| {
            self.topology
                .borrow()
                .sheets
                .get(idx)
                .map(|(n, _)| n.clone())
        });
        Ok(Some((scope_idx, scope_name, expr)))
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
