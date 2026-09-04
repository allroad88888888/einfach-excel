//! 异步自定义函数调用的登记、完成与清理。

use super::*;

impl WorkbookAtomContext {
    pub(crate) fn take_pending_async_custom_calls(&self) -> Vec<PendingAsyncCustomCall> {
        self.sweep_async_custom_entries();
        std::mem::take(&mut self.async_custom.borrow_mut().pending)
    }

    /// Write an async call's settled value into its result atom. Returns
    /// `None` (and writes nothing) when the call_id is unknown or stale —
    /// i.e. the registry changed while the Promise was in flight.
    ///
    /// 结算成功时返回被写入的结果 atom —— 调用方（`Workbook`）需要它作为
    /// 反向依赖的根，去给观察它的数组公式补 spill 投影。异步结算是一次
    /// 纯 `Store::set`，不经过任何 mutation 入口，所以那条投影不会自己发生。
    pub(crate) fn resolve_async_custom_call(&self, call_id: u64, value: Value) -> Option<AtomId> {
        let atom = {
            let mut state = self.async_custom.borrow_mut();
            let key = state.by_call_id.remove(&call_id)?;
            let generation = state.generation;
            let entry = state.entries.get(&key)?;
            if entry.call_id != call_id || entry.generation != generation {
                return None;
            }
            entry.atom
        };
        self.store.set(atom, value);
        Some(atom)
    }

    /// Diagnostics: number of memoized async custom-formula entries.
    pub(crate) fn async_custom_entry_count(&self) -> usize {
        self.async_custom.borrow().entries.len()
    }

    /// Best-effort cap enforcement: evict entries whose result atom nobody
    /// observes (no dependents, no subscribers — same judgement as
    /// `AtomFamily::evict`). Runs only outside read frames, so dependency
    /// edges are committed and destroying an unobserved atom is invisible.
    pub(super) fn sweep_async_custom_entries(&self) {
        let mut state = self.async_custom.borrow_mut();
        if state.entries.len() <= ASYNC_CUSTOM_RESULT_CACHE_CAP {
            return;
        }
        let evict: Vec<(String, u64, AtomId)> = state
            .entries
            .iter()
            .filter(|(_, e)| {
                !self.store.has_dependents(e.atom) && !self.store.has_subscribers(e.atom)
            })
            .map(|(k, e)| (k.clone(), e.call_id, e.atom))
            .collect();
        for (key, call_id, atom) in evict {
            state.entries.remove(&key);
            state.by_call_id.remove(&call_id);
            self.store.destroy_atom(atom);
        }
    }

    /// Async dispatch: memoized per (name, args). Returns the per-call
    /// result atom's current value (settled result or `#BUSY!`) and makes
    /// the calling formula depend on that atom, so the settle write — or a
    /// registry-invalidation reset — re-derives exactly the observers.

    pub(super) fn async_custom_result(
        &self,
        name: &str,
        values: &[Value],
        args: &ReadArgs,
    ) -> Value {
        let key = canonical_custom_call_key(name, values);
        let atom = {
            let mut state = self.async_custom.borrow_mut();
            let generation = state.generation;
            let next_call_id = state.next_call_id;
            match state.entries.get_mut(&key) {
                Some(entry) if entry.generation == generation => entry.atom,
                Some(entry) => {
                    // Survived a registry invalidation: value is already
                    // back to #BUSY!; re-arm under a fresh call_id.
                    entry.call_id = next_call_id;
                    entry.generation = generation;
                    let atom = entry.atom;
                    state.next_call_id += 1;
                    state.by_call_id.insert(next_call_id, key.clone());
                    state.pending.push(PendingAsyncCustomCall {
                        call_id: next_call_id,
                        name: name.to_string(),
                        args: values.to_vec(),
                    });
                    atom
                }
                None => {
                    // Creating an atom inside a read frame is fine — the
                    // facade machinery does the same.
                    let atom = self.store.create_atom(Value::Error(ValueError::Busy));
                    state.next_call_id += 1;
                    state.entries.insert(
                        key.clone(),
                        AsyncCustomEntry {
                            atom,
                            call_id: next_call_id,
                            generation,
                        },
                    );
                    state.by_call_id.insert(next_call_id, key.clone());
                    state.pending.push(PendingAsyncCustomCall {
                        call_id: next_call_id,
                        name: name.to_string(),
                        args: values.to_vec(),
                    });
                    atom
                }
            }
        };
        args.get(atom)
    }
}
