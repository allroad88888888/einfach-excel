//! workbook custom operations.

use super::*;

impl Workbook {
    pub fn set_custom_function_registry(
        &mut self,
        registry: Option<Arc<dyn CustomFunctionRegistry>>,
    ) {
        if self.is_inside_custom_call() {
            // Re-entrancy guard. Swapping the registry mid-callback is
            // the worst possible time to do it (the running callback's
            // closure environment becomes orphaned). Drop the request;
            // hosts that need this should defer it past the read.
            return;
        }
        self.custom_functions = registry;
        self.atom_context
            .set_custom_functions(self.custom_functions.clone(), false);
    }

    /// Clone of the currently-installed custom-formula registry handle,
    /// if any. Returns the `Arc<dyn ...>` so the caller can stash it for
    /// later (e.g. the per-eval provider snapshots the Arc up-front so
    /// it survives concurrent re-installs).
    pub fn custom_function_registry(&self) -> Option<Arc<dyn CustomFunctionRegistry>> {
        self.custom_functions.clone()
    }

    /// True iff a host custom-formula JS callback is currently executing
    /// through either formula-inner or top-level evaluation. Public so the
    /// WASM bridge can short-circuit re-entrant
    /// mutation calls with a meaningful error rather than the opaque
    /// `wasm-bindgen` "recursive use of an object" panic.
    ///
    /// See `CUSTOM_FORMULAS.md` § "No mutations during callback" for the
    /// contract.
    pub fn is_inside_custom_call(&self) -> bool {
        self.custom_call_depth.get() > 0
    }

    /// Handle to the re-entrancy depth counter. `pub(crate)` because the
    /// evaluator adapters construct a `CustomCallScope` from this; external
    /// callers should use `is_inside_custom_call` to query.
    pub(crate) fn custom_call_depth_cell(&self) -> &Cell<usize> {
        &self.custom_call_depth
    }

    /// Publish a custom-registry change through its Store version root.
    /// Materialized formulas that called into the registry re-derive through
    /// their recorded Store edge; unread formulas remain lazy. The root is
    /// intentionally coarse and does not retain an address-to-formula or
    /// per-function reverse index.
    pub fn invalidate_all_formulas_for_custom_function_change(&self) {
        self.atom_context
            .set_custom_functions(self.custom_functions.clone(), true);
    }

    /// Drain the queue of async custom-formula calls that evaluation has
    /// requested since the last drain. The host runs each callback on its
    /// own event loop and reports outcomes via `resolve_async_custom_call`.
    /// Call after mutation entry points return — never from inside a
    /// custom-formula callback (returns empty there, matching the other
    /// entry-point guards).
    pub fn take_pending_async_custom_calls(&mut self) -> Vec<PendingAsyncCustomCall> {
        if self.is_inside_custom_call() {
            return Vec::new();
        }
        self.atom_context.take_pending_async_custom_calls()
    }

    /// Diagnostics: number of memoized async custom-formula (name, args)
    /// entries currently cached. Exposed for cap/sweep tests and host
    /// debug probes.
    pub fn async_custom_entry_count(&self) -> usize {
        self.atom_context.async_custom_entry_count()
    }

    /// Settle an async custom-formula call: write `value` into the per-call
    /// result atom and let Store propagation recompute the observers.
    /// Returns `Ok(false)` when the call_id is unknown or stale (the
    /// registry changed while the Promise was in flight) — the value is
    /// dropped. Rejected inside a custom-formula callback like every other
    /// mutation entry point.
    pub fn resolve_async_custom_call(
        &mut self,
        call_id: u64,
        value: Value,
    ) -> Result<bool, WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        let Some(atom) = self.atom_context.resolve_async_custom_call(call_id, value) else {
            return Ok(false);
        };
        // 结算值可能是 `Value::Array`（异步自定义公式返回动态数组）。结算本身
        // 只是一次 `Store::set`，走不到任何 mutation 入口，因此不会有人去装
        // spill 投影 —— 少了这一步，同一个数组「同步返回会溢出、异步结算不会」，
        // 正是最难查的那类不一致。这里复用写路径完全相同的三段式：
        // 反向依赖 → 挑出需要维护 spill 的数组公式 → `recompute_array_formulas_in`。
        // 非数组结算走到这里也是安全的：`recompute_array_formula` 见到非数组结果
        // 会拆掉旧投影或直接返回。
        self.reproject_array_formulas_observing(atom);
        Ok(true)
    }

    /// 把「观察某个 Store atom 的数组公式」重新投影一遍。根是 atom 而不是
    /// 地址，因为异步结算的源头是每次调用的结果 atom，没有对应单元格。
    pub(crate) fn reproject_array_formulas_observing(&mut self, root: AtomId) {
        let dependent_atoms = self.store.reverse_dependents(&[root]);
        let groups: Vec<(usize, HashSet<CellAddress>)> = self
            .sheets
            .iter()
            .enumerate()
            .filter_map(|(sheet_idx, sheet)| {
                let addrs = sheet.array_formula_addrs_for_store_atoms(&dependent_atoms);
                (!addrs.is_empty()).then_some((sheet_idx, addrs))
            })
            .collect();
        self.recompute_array_formula_groups(groups);
    }

    pub(crate) fn validate_name(name: &str) -> Result<(), WorkbookError> {
        if name.is_empty() || name.len() > 255 {
            return Err(WorkbookError::InvalidName);
        }
        let mut bytes = name.bytes();
        let first = bytes.next().unwrap();
        let first_ok = first.is_ascii_alphabetic() || first == b'_';
        if !first_ok {
            return Err(WorkbookError::InvalidName);
        }
        for b in bytes {
            let ok = b.is_ascii_alphanumeric() || b == b'_';
            if !ok {
                return Err(WorkbookError::InvalidName);
            }
        }
        Ok(())
    }
}
