//! 工作簿公式求值使用的隐藏行镜像。

use super::*;

impl WorkbookAtomContext {
    /// Tracked read of the MANUAL hidden-row invalidation epoch (design doc #32
    /// §6.2). Consulted by `hidden_rows_for_sheet` — including its miss
    /// branch — so a SUBTOTAL 101-111 formula that currently sees NO hidden
    /// rows still re-derives once the host pushes a set (mirrors
    /// `depend_tables`'s pre-probe placement).

    pub(super) fn depend_manual_hidden(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.manual_hidden_epoch, self.manual_hidden_revision.get());
        let _ = args.get(id);
    }

    /// Tracked read of the FILTER hidden-row invalidation epoch
    /// (`design-filter-hidden-rows` §6.4). Same pre-probe placement as
    /// `depend_manual_hidden`, but on its own atom so a manual hide/unhide
    /// never dirties the 1-11 formulas that only hold this edge.
    pub(super) fn depend_filter_hidden(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.filter_hidden_epoch, self.filter_hidden_revision.get());
        let _ = args.get(id);
    }

    /// Resolve the host-pushed MANUAL hidden-row set for `sheet_index` as a
    /// *tracked* read (the live formula-inner path). Registers the
    /// `manual_hidden_epoch` edge before the probe so the 101-111 formula
    /// re-derives on any future push, then returns the per-sheet set (`None`
    /// when empty/absent, or when `sheet_index` is `None`).
    pub(crate) fn hidden_rows_for_sheet(
        &self,
        sheet_index: Option<usize>,
        args: &ReadArgs,
    ) -> Option<Rc<HashSet<u32>>> {
        self.depend_manual_hidden(args);
        let sheet_index = sheet_index?;
        self.eval_hidden_rows.borrow().get(&sheet_index).cloned()
    }

    /// Resolve the host-pushed FILTER hidden-row set for `sheet_index` as a
    /// *tracked* read. Twin of `hidden_rows_for_sheet` against the independent
    /// filter side store and the independent `filter_hidden_epoch`; read by
    /// BOTH SUBTOTAL layers (`design-filter-hidden-rows` §6.3).
    pub(crate) fn filter_hidden_rows_for_sheet(
        &self,
        sheet_index: Option<usize>,
        args: &ReadArgs,
    ) -> Option<Rc<HashSet<u32>>> {
        self.depend_filter_hidden(args);
        let sheet_index = sheet_index?;
        self.eval_filter_hidden_rows
            .borrow()
            .get(&sheet_index)
            .cloned()
    }

    /// Untracked MANUAL hidden-row lookup for the eager `WorkbookEvalProvider`
    /// (`define_name` / `get_cell` of a non-formula cell). That path does not
    /// participate in reactive invalidation, so it reads the side storage
    /// directly without an epoch edge.
    pub(crate) fn hidden_rows_untracked(&self, sheet_index: usize) -> Option<Rc<HashSet<u32>>> {
        self.eval_hidden_rows.borrow().get(&sheet_index).cloned()
    }

    /// Untracked FILTER hidden-row lookup for the eager
    /// `WorkbookEvalProvider`. Twin of `hidden_rows_untracked`.
    pub(crate) fn filter_hidden_rows_untracked(
        &self,
        sheet_index: usize,
    ) -> Option<Rc<HashSet<u32>>> {
        self.eval_filter_hidden_rows
            .borrow()
            .get(&sheet_index)
            .cloned()
    }

    /// Republish `Workbook`'s engine-owned MANUAL hidden set for
    /// `sheet_index` into the evaluation mirror (E2 of
    /// `design-engine-hidden-rows.md` §2.1). Whole-set replace; an empty set
    /// drops the entry, upholding the "a lookup miss and an empty set are the
    /// same no-filtering signal" contract. The side storage is updated BEFORE
    /// the epoch bump so the eager re-derivation the `store.set` triggers
    /// reads the new set.
    ///
    /// **Idempotent** (§3): the epoch fires only when the mirror actually
    /// changed. This ledger used to live in the host — the bridge compared a
    /// serialized `lastPushed` string and `continue`d on a match — and the
    /// setter below it bumped unconditionally. Owning the state moves the
    /// publisher onto hot paths (every structural edit republishes), so
    /// without the equality check a plain `insert_rows` would dirty every
    /// SUBTOTAL 101-111 formula in the workbook for nothing. The filter half
    /// keeps its own store and its own epoch and is untouched here, so a
    /// manual republish still cannot dirty the 1-11 formulas that hold only
    /// the filter edge.
    ///
    /// Returns whether the epoch fired.
    pub(crate) fn publish_eval_hidden_rows(&self, sheet_index: usize, rows: HashSet<u32>) -> bool {
        {
            let mut map = self.eval_hidden_rows.borrow_mut();
            let current = map.get(&sheet_index);
            let unchanged = match current {
                Some(existing) => **existing == rows,
                None => rows.is_empty(),
            };
            if unchanged {
                return false;
            }
            if rows.is_empty() {
                map.remove(&sheet_index);
            } else {
                map.insert(sheet_index, Rc::new(rows));
            }
        }
        self.bump_epoch(&self.manual_hidden_epoch, &self.manual_hidden_revision);
        true
    }

    /// Drop the mirror entry for a sheet index that no longer exists, without
    /// consulting an owned set (there is none to consult). Used by
    /// `Workbook::republish_hidden_all` to reconcile the mirror's key space
    /// with the sheet vector after a topology change.
    pub(crate) fn drop_eval_hidden_rows_above(&self, sheet_count: usize) -> bool {
        let removed = {
            let mut map = self.eval_hidden_rows.borrow_mut();
            let before = map.len();
            map.retain(|key, _| *key < sheet_count);
            map.len() != before
        };
        if removed {
            self.bump_epoch(&self.manual_hidden_epoch, &self.manual_hidden_revision);
        }
        removed
    }

    /// Republish `Workbook`'s engine-owned FILTER-derived set for
    /// `sheet_index` into the evaluation mirror (E3 of
    /// `design-engine-hidden-rows.md`). Exact twin of
    /// `publish_eval_hidden_rows` against the independent side store, firing
    /// the independent `filter_hidden_epoch` — so BOTH SUBTOTAL layers
    /// re-derive while the manual store and its epoch stay untouched.
    ///
    /// **Idempotent**, and §3 asks for the two sets to be judged
    /// SEPARATELY: a manual hide must not dirty the 1-11 formulas that hold
    /// only the filter edge, and a filter apply must not dirty anything if
    /// it produced the same answer. Owning the state puts this publisher on
    /// hot paths — every structural edit republishes both halves — so
    /// without the equality check a plain `insert_rows` on a sheet with
    /// nothing filtered would dirty every SUBTOTAL in the workbook,
    /// including the 1-11 half that the two-epoch split exists to protect.
    ///
    /// Returns whether the epoch fired.
    pub(crate) fn publish_eval_filter_hidden_rows(
        &self,
        sheet_index: usize,
        rows: HashSet<u32>,
    ) -> bool {
        {
            let mut map = self.eval_filter_hidden_rows.borrow_mut();
            let unchanged = match map.get(&sheet_index) {
                Some(existing) => **existing == rows,
                None => rows.is_empty(),
            };
            if unchanged {
                return false;
            }
            if rows.is_empty() {
                map.remove(&sheet_index);
            } else {
                map.insert(sheet_index, Rc::new(rows));
            }
        }
        self.bump_epoch(&self.filter_hidden_epoch, &self.filter_hidden_revision);
        true
    }

    /// Twin of `drop_eval_hidden_rows_above` for the filter mirror: drop
    /// entries keyed past the end of the sheet vector after a topology
    /// change.
    pub(crate) fn drop_eval_filter_hidden_rows_above(&self, sheet_count: usize) -> bool {
        let removed = {
            let mut map = self.eval_filter_hidden_rows.borrow_mut();
            let before = map.len();
            map.retain(|key, _| *key < sheet_count);
            map.len() != before
        };
        if removed {
            self.bump_epoch(&self.filter_hidden_epoch, &self.filter_hidden_revision);
        }
        removed
    }

    /// Remap both hidden-row side stores after the sheet at `removed` was
    /// deleted from the workbook's sheet vector: the removed sheet's own entry
    /// dies with it, and every later key shifts down by one to track the sheet
    /// that now occupies that index.
    ///
    /// Without this, a deletion silently re-attaches a hidden set to whichever
    /// sheet slid into the vacated index (or orphans it entirely), and SUBTOTAL
    /// 1-11 / 101-111 filter against the wrong sheet's rows. It cannot
    /// self-heal: the host bridge subscribes to `viewportHiddenAtom`, which a
    /// sheet deletion never touches, so no corrective re-push ever arrives.
    pub(crate) fn remap_hidden_rows_after_sheet_remove(&self, removed: usize) {
        self.remap_hidden_rows(|key| match key.cmp(&removed) {
            Ordering::Equal => None,
            Ordering::Greater => Some(key - 1),
            Ordering::Less => Some(key),
        });
    }

    /// Remap both hidden-row side stores after a sheet moved from `from` to
    /// `to`, applying the same rotation the sheet vector just underwent.
    pub(crate) fn remap_hidden_rows_after_sheet_move(&self, from: usize, to: usize) {
        self.remap_hidden_rows(|key| Some(remap_sheet_index_after_move(key, from, to)));
    }

    /// Apply `remap` to the keys of BOTH index-keyed hidden-row stores, firing
    /// each store's epoch only if that store actually changed — so a sheet
    /// reorder does not needlessly dirty SUBTOTAL formulas on the layer that
    /// held no sets.
    pub(super) fn remap_hidden_rows(&self, remap: impl Fn(usize) -> Option<usize>) {
        if remap_index_keyed_rows(&self.eval_hidden_rows, &remap) {
            self.bump_epoch(&self.manual_hidden_epoch, &self.manual_hidden_revision);
        }
        if remap_index_keyed_rows(&self.eval_filter_hidden_rows, &remap) {
            self.bump_epoch(&self.filter_hidden_epoch, &self.filter_hidden_revision);
        }
    }

    /// Follow both hidden-row side stores through a ROW insert/delete on
    /// `sheet_index`, displacing the row numbers INSIDE each set (the twin of
    /// `remap_hidden_rows`, which moves the map's sheet-index keys).
    ///
    /// Without this the sets keep pre-shift row numbers while every other
    /// row-indexed fact on the sheet — cells, formulas, spills, formats,
    /// dimensions, Tables — has already moved, so SUBTOTAL 1-11 / 101-111
    /// excludes a row the host never hid and aggregates one it did.
    ///
    /// This does NOT double-shift against the host's own maintenance. Both
    /// public setters are whole-set REPLACE of absolute row indices — they
    /// insert a fresh set and never merge a delta — so a host that re-pushes
    /// its already-displaced snapshot simply overwrites with the same answer.
    /// The engine shift is what keeps the engine correct on its own, in the
    /// window before a re-push arrives or when no host re-push exists at all.
    ///
    /// Column edits never reach here: they displace nothing in a row set.
    pub(crate) fn shift_hidden_rows_after_row_edit(
        &self,
        sheet_index: usize,
        at: u32,
        count: u32,
        insert: bool,
    ) {
        if shift_rows_for_sheet(&self.eval_hidden_rows, sheet_index, at, count, insert) {
            self.bump_epoch(&self.manual_hidden_epoch, &self.manual_hidden_revision);
        }
        if shift_rows_for_sheet(
            &self.eval_filter_hidden_rows,
            sheet_index,
            at,
            count,
            insert,
        ) {
            self.bump_epoch(&self.filter_hidden_epoch, &self.filter_hidden_revision);
        }
    }
}
