//! Spill (dynamic-array) re-projection: re-runs the projection at each engine
//! event that can have invalidated spill geometry.
//!
//! Three such events, all funnelling into `recompute_array_formula`:
//!
//!   - a write, through the Store reverse-dependency set the mutation paths
//!     collect (`recompute_array_formulas_in`);
//!   - the tail of a bulk install (`install_bulk_spill_projections`);
//!   - a structural row/column edit, which brackets the shift with
//!     `teardown_all_spills` + `teardown_blocked_spill_anchors` before and
//!     `rederive_spill_anchors` after.
//!
//! Installing and tearing down the projection itself lives in the sibling
//! module `sheet_spill.rs`; this module only picks the anchors to hand it.
//!
//! Child module of `sheet` for the same reason as `sheet_spill.rs` — see that
//! file's header.

use std::collections::HashSet;
use std::rc::Rc;

use einfach_core::{AtomId, Value, ValueError};

use crate::cell::CellAddress;
use crate::formula::parse_formula;

use super::{expr_may_produce_array, source_may_produce_array, Sheet};

impl Sheet {
    fn formula_has_spill_anchor(&self, addr: CellAddress) -> bool {
        self.interior
            .cells
            .borrow()
            .get(&addr)
            .and_then(|slot| slot.atom_id())
            .is_some_and(|id| self.spill_targets.contains_key(&id))
    }

    pub(super) fn formula_needs_spill_maintenance(&self, addr: CellAddress) -> bool {
        self.formula_has_spill_anchor(addr)
            || self
                .interior
                .formula_cells
                .borrow()
                .get(&addr)
                .is_some_and(|record| expr_may_produce_array(&record.expr))
    }

    /// Give every just-installed dynamic-array formula its spill projection.
    /// Tail step of `bulk_install_storage`.
    ///
    /// WHY at install time and not at first read: a projection creates derived
    /// atoms and rewrites `cells` plus the three spill indexes, so it needs
    /// `&mut self`. Every read entry point takes `&self` — that is exactly
    /// what lets hydration happen from a read (`hydrate_formula`) — so a read
    /// can never install one. `recompute_array_formula` states the same rule
    /// for the per-cell write path. A bulk install adopts every formula on
    /// the sheet without any follow-up mutation, so it is the only moment at
    /// which a bulk-installed anchor can be projected; omitting this step is
    /// what left imported `=SEQUENCE(10)` showing its top-left value alone.
    ///
    /// WHY this does not defeat the storage-primary lazy contract: the
    /// candidate gate is `source_may_produce_array`, a parse-free byte scan.
    /// Only sources that could possibly yield an array are parsed, and only
    /// those the AST gate (`expr_may_produce_array` — the same gate the write
    /// path uses) confirms get hydrated and evaluated. A sheet of `=A1*2` /
    /// `=SUM(A1:A9)` formulas hydrates nothing here, so "install does zero
    /// dep work" still holds for everything except anchors, whose geometry is
    /// the one fact that cannot be recovered lazily.
    ///
    /// Confirmation is completed for ALL candidates before the first
    /// projection runs, for two reasons: projecting evaluates a formula,
    /// which hydrates its dependency closure and DRAINS those cells'
    /// `formula_source` entries (a later candidate would then look
    /// source-less); and `#SPILL!` arbitration between two anchors competing
    /// for one cell must not depend on iteration luck. `formula_source` is a
    /// `RowMajorMap`, so the surviving anchor is the row-major-first one
    /// rather than whatever order the caller's `HashMap` happened to yield.
    ///
    /// 跨表：调用方保证世界已是最终态。一条读别的表的 anchor 是拿那张表
    /// **当前**的内容投影的，所以多表安装必须先把每张表的存储都落地、再逐表
    /// 调这里 —— `Workbook::install_workbook_bulk` 的两阶段就是干这个的。
    /// 另一半（安装换掉了别的表上某个活着的数组公式的源）由
    /// `Workbook::reproject_cross_sheet_arrays_after_install` 在安装批次关闭
    /// 后补上，走的是 `Workbook::set_*` 一直在用的 Store 反向依赖那条路。
    pub(super) fn install_bulk_spill_projections(&mut self) {
        // Snapshot candidate sources under one short borrow (`Rc<str>` clones
        // are pointer bumps), then parse outside it — parsing must not run
        // while `formula_source` is borrowed.
        let candidates: Vec<(CellAddress, Rc<str>)> = {
            let source = self.interior.formula_source.borrow();
            source
                .iter()
                .filter(|(_, parked)| source_may_produce_array(parked.source.as_ref()))
                .map(|(addr, parked)| (addr, parked.source.clone()))
                .collect()
        };
        if candidates.is_empty() {
            return;
        }
        let anchors: Vec<CellAddress> = candidates
            .into_iter()
            .filter(|(_, src)| {
                parse_formula(src.as_ref()).is_some_and(|expr| expr_may_produce_array(&expr))
            })
            .map(|(addr, _)| addr)
            .collect();
        self.project_bulk_spill_anchors(anchors);
    }

    /// 给一批**刚落地的**公式地址装上 spill 投影 —— 两条批量路径共用的收尾。
    ///
    /// 候选是怎么选出来的两条路各不相同：全表替换
    /// （`install_bulk_spill_projections`）扫 `formula_source` 的停放源码，
    /// 增量回放（`WorkbookLoader::flush`）直接用 workbook 侧为跨表环检查
    /// 已经解析好的 AST。选完之后要做的事完全一样，所以只留这一份实现。
    ///
    /// 行主序排序的理由与 `recompute_array_formulas_in` 一致：两个 anchor
    /// 争同一块矩形时，先跑的占住、后跑的读 `#SPILL!` —— 顺序是**可观测**的，
    /// 不能由调用方容器（`HashMap` 的随机 hash 序）来决定。
    pub(crate) fn project_bulk_spill_anchors(&mut self, mut anchors: Vec<CellAddress>) {
        if anchors.is_empty() {
            return;
        }
        anchors.sort_unstable_by_key(|a| (a.row, a.col));
        anchors.dedup();
        for addr in anchors {
            // Same entry point the write path uses: hydrate, read the one
            // authoritative formula-inner value, install the targets, or route
            // `#SPILL!` to the anchor on collision. Collision detection sees
            // parked formulas and parked plain values (`is_target_occupied`
            // probes `needs_parse` and `CellSlot::Plain`), so a spill blocked
            // by imported content is caught here rather than at first read.
            self.recompute_array_formula(addr);
        }
        // A collision registered during the loop can be freed by a later
        // anchor's teardown; same drain as the write path.
        self.drain_teardown_driven_retries();
    }

    /// Store-backed spill projection refresh for a single formula cell.
    /// Reads the already-invalidated formula-inner value, then:
    ///   - if the new result is `Value::Array` → install / refresh the
    ///     spill anchor and derived targets via `install_formula_spill`.
    ///     On collision, the anchor Store atom becomes
    ///     `Value::Error(Spill)` so the formula facade surfaces `#SPILL!`.
    ///   - if the new result is not an array → tear down any existing
    ///     spill at `addr` (the formula previously produced an array).
    ///
    /// No-op for non-formula cells. Called from the mutation paths
    /// (`try_set_formula`, `try_set_cell`, `clear_cell`) so dynamic-array
    /// formulas re-spill synchronously on dependency changes — the
    /// `Sheet::get_cell` lazy eval path can't mutate, so the spill
    /// install has to happen here.
    pub(super) fn recompute_array_formula(&mut self, addr: CellAddress) {
        // ADR 0006 stage 0/2 — this method is the single authority on whether
        // `addr` is a blocked anchor, so it clears the claim up front and
        // every exit below is then correct by construction: the two `Err`
        // arms re-register (the collision survived), and every other exit
        // means the address is no longer a blocked anchor (it spilled, it
        // stopped producing an array, or it stopped being a formula).
        // `retire_blocked_anchor` drops the anchor's rectangle claims with it,
        // which is what keeps the claims registry from naming anchors that
        // are no longer `#SPILL!`.
        if self.has_blocked_anchors() {
            self.retire_blocked_anchor(addr);
        }

        // Snapshot whether this address previously held a spill anchor
        // (in cells[addr] → spill_targets). Used to decide whether we
        // need to tear down on a scalar result.
        let prev_anchor_atom: Option<AtomId> = self
            .interior
            .cells
            .borrow()
            .get(&addr)
            .and_then(|slot| slot.atom_id())
            .filter(|id| self.spill_targets.contains_key(id));

        // LAZY_FORMULA_INDEXING Phase 3: hydrate before consulting
        // `formula_cells` so unhydrated array-producing formulas get
        // their spill installed by this eager pass.
        self.hydrate_formula(addr);
        let Some(record) = self.interior.formula_cells.borrow().get(&addr).cloned() else {
            // Not a formula cell — nothing to recompute.
            return;
        };

        // Gate the eager re-eval: only formulas that *might* produce a
        // `Value::Array` get this treatment. Scalar-only formulas stay
        // fully lazy (preserves the compatibility lazy-eval/debug counters).
        if prev_anchor_atom.is_none() && !expr_may_produce_array(&record.expr) {
            return;
        }

        // The mutation that selected this formula already invalidated its
        // Store dependency chain. Read that one authoritative derived value;
        // do not create a second invalidation/evaluation path for spill
        // projection.
        let value = {
            let inner = self.facade_ctx().formula_inner_of(addr);
            self.store.get(inner)
        };

        match value {
            Value::Array(arr) => {
                // Shape is read BEFORE the install consumes `arr`: the two
                // `Err` arms below need it to register the blocked anchor's
                // would-be rectangle, and by then the array has moved.
                let wanted_shape = arr.shape();
                // Tear down any previous spill at this address before
                // re-installing (handles shape changes).
                self.clear_spill_at_address(addr);
                match self.install_formula_spill(addr, arr) {
                    Ok(()) => {}
                    Err(ValueError::Spill) => {
                        // Replace the anchor projection with #SPILL!. The
                        // facade already depends on formula-inner and will now
                        // also observe this Store atom.
                        // P4a borrow rule: copy the atom id out before the
                        // `store.set` (which dispatches listeners).
                        let atom_id = self
                            .interior
                            .cells
                            .borrow()
                            .get(&addr)
                            .and_then(|slot| slot.atom_id());
                        if let Some(atom_id) = atom_id {
                            self.store.set(atom_id, Value::Error(ValueError::Spill));
                        }
                        // ADR 0006 stage 0/2 — nothing was installed, so the
                        // three spill maps stay empty for this anchor and
                        // `teardown_all_spills` cannot see it. Record the
                        // claim here so the next structural edit retries it
                        // (stage 0) and so clearing the obstruction revives
                        // the array on its own (stage 2).
                        self.register_blocked_anchor(addr, wanted_shape);
                        self.bump_facade_epoch(addr);
                    }
                    Err(other) => {
                        // P4a borrow rule: copy the atom id out before the
                        // `store.set` (which dispatches listeners).
                        let atom_id = self
                            .interior
                            .cells
                            .borrow()
                            .get(&addr)
                            .and_then(|slot| slot.atom_id());
                        if let Some(atom_id) = atom_id {
                            self.store.set(atom_id, Value::Error(other.clone()));
                        }
                        // Same reasoning as the `Spill` arm above: no
                        // targets installed, so the retry has to be driven
                        // off this registry.
                        self.register_blocked_anchor(addr, wanted_shape);
                        self.bump_facade_epoch(addr);
                    }
                }
            }
            _ => {
                // Formula no longer produces an array — tear down any
                // prior spill. If the cells[addr] primitive atom was the
                // spill anchor, drop it so future reads resolve directly
                // through formula-inner again.
                if prev_anchor_atom.is_some() {
                    self.clear_spill_at_address(addr);
                    self.drop_cell_slot(addr);
                    self.attach_address_sub(addr);
                    self.bump_facade_epoch(addr);
                }
            }
        }
    }

    /// Re-project formulas selected through Store reverse dependencies that
    /// produce, or previously produced, a `Value::Array`. This maintains
    /// spill geometry synchronously because the `&self` read path cannot
    /// mutate it. Formula values still come exclusively from formula-inner;
    /// this method owns no result cache or invalidation graph.
    pub(crate) fn recompute_array_formulas_in(&mut self, addrs: &HashSet<CellAddress>) {
        // Collect addresses to process — clone the addresses to avoid
        // borrowing self while we mutate.
        //
        // LAZY_FORMULA_INDEXING Phase 3: hydrate each candidate before
        // taking the filter; an unhydrated formula at `a` would slip
        // past the `formula_cells.contains_key(a)` test and the
        // downstream array-recompute would miss it. Hydration is
        // idempotent — already-hydrated addrs cost a single
        // `needs_parse.contains` lookup.
        let mut candidates: Vec<CellAddress> = addrs
            .iter()
            .copied()
            .filter(|a| {
                self.hydrate_formula(*a);
                self.interior.formula_cells.borrow().contains_key(a)
            })
            .collect();
        // ADR 0006 stage 2 — impose the order. The caller hands us a
        // `HashSet`, whose iteration order comes from a per-process random
        // seed, and re-projection order is OBSERVABLE whenever two anchors
        // contend for one rectangle: whoever runs first claims it and the
        // other reads `#SPILL!`. That used to be latent because a set with two
        // array formulas in it was rare; stage 2 puts blocked anchors into
        // this set on ordinary writes, so contention is now reachable from a
        // keystroke. Row-major is the same tie-break `teardown_all_spills`,
        // `install_bulk_spill_projections` and `sort.rs` §5.1 already use.
        candidates.sort_unstable_by_key(|a| (a.row, a.col));
        for a in candidates {
            self.recompute_array_formula(a);
        }
        self.drain_teardown_driven_retries();
    }

    /// ADR 0006 stage 2 — retry the anchors that a spill TEARDOWN unblocked.
    ///
    /// Withdrawing array X frees every cell it was projecting into, and one of
    /// those may be the obstruction that parked array Y at `#SPILL!`. The write
    /// that caused it touched X's anchor, which carries none of Y's claims, so
    /// `clear_spill` posts the freed cells' owners instead and this drains them.
    ///
    /// The loop exists because a retry can itself free cells: Y spills, or Y's
    /// own stale projection is torn down and re-installed at a new shape. The
    /// budget is what makes that terminate no matter what geometry is on the
    /// sheet — this is a best-effort convenience, and the correct value is
    /// already in place before the first round (an anchor that does not get
    /// retried simply stays `#SPILL!`, which is what it was). Rounds, not
    /// anchors, are capped: one round handles any number of independent
    /// anchors, and depth beyond a couple needs arrays chained through each
    /// other's rectangles, which has no legitimate spreadsheet meaning.
    fn drain_teardown_driven_retries(&mut self) {
        const MAX_ROUNDS: usize = 4;
        for _ in 0..MAX_ROUNDS {
            let retries = self.drain_blocked_anchor_retries();
            if retries.is_empty() {
                return;
            }
            for addr in retries {
                self.recompute_array_formula(addr);
            }
        }
        // Budget exhausted: drop whatever is still queued so it cannot leak
        // into a later, unrelated mutation's re-projection.
        let _ = self.drain_blocked_anchor_retries();
    }

    /// AUDIT A-5 — snapshot and tear down every active spill ahead of a
    /// structural shift. `spill_targets` stores target *addresses* keyed
    /// by anchor *atom id*; neither survives `relocate_cells` coherently
    /// (the audit's stale-bookkeeping panic). Instead of remapping keys,
    /// the chosen design tears everything down pre-shift and re-derives
    /// surviving anchors post-shift (`rederive_spill_anchors`), so spills
    /// always re-flow contiguously from the (possibly shifted) anchor —
    /// Excel's recompute-after-structural-edit contract.
    ///
    /// Returns the pre-shift anchor addresses. `clear_spill` removes the
    /// derived target atoms; each anchor's primitive (holding the
    /// `Value::Array`) stays in `cells` and is shifted by
    /// `relocate_cells` like any other primitive.
    pub(super) fn teardown_all_spills(&mut self) -> Vec<CellAddress> {
        let anchor_atoms: Vec<AtomId> = self.spill_targets.keys().copied().collect();
        let mut anchors = Vec::with_capacity(anchor_atoms.len());
        for anchor_atom in anchor_atoms {
            if let Some(addr) = self.anchor_address_for(anchor_atom) {
                anchors.push(addr);
            }
            self.clear_spill(anchor_atom);
        }
        // `spill_targets` is a `HashMap` with a per-process randomly seeded
        // hasher, so its key order differs between runs. That order used to
        // reach `rederive_spill_anchors` verbatim, making the post-shift
        // re-derivation order — and therefore any anchor whose formula reads a
        // cell another anchor is about to spill into — nondeterministic. The
        // golden replay oracle caught it as a run-to-run flip on seed 53
        // (`=SEQUENCE(3,1,N23)` starting at 0 or at 273 depending on whether
        // the anchor owning N23 had re-derived yet). Sort row-major so the
        // shift has one answer. `teardown_blocked_spill_anchors` sorts too, and
        // the two lists are concatenated installed-first.
        anchors.sort_unstable_by_key(|a| (a.row, a.col));
        anchors
    }

    /// ADR 0006 stage 0 — companion to `teardown_all_spills` for anchors
    /// parked in the COLLIDED state. There is nothing to tear down (a
    /// collided anchor installed no target atoms), but the addresses must
    /// ride the same snapshot → shift → re-derive pipeline, otherwise a
    /// structural edit that frees the obstruction never retries the spill
    /// and the sticky `Error(Spill)` primitive in `cells[addr]` keeps the
    /// anchor reading `#SPILL!` forever.
    ///
    /// Draining rather than cloning is what keeps the registry tight:
    /// `rederive_spill_anchors` re-registers exactly those anchors that
    /// still collide at their post-shift addresses, so entries whose
    /// formula was deleted by the shift, or whose obstruction moved away,
    /// simply do not come back.
    ///
    /// Sorted row-major because `HashSet` iteration order must not decide
    /// which of two blocked anchors wins a rectangle the shift just freed
    /// for both.
    ///
    /// `pub(crate)` rather than `pub(super)` because `sort.rs` is the second
    /// caller: `sort_range` relocates cells without going through
    /// `apply_structural_shift`, yet moves blocked anchors exactly the same
    /// way. Both callers must pair this with `rederive_spill_anchors` over
    /// the SAME address remap, or the registry keeps pre-move keys.
    pub(crate) fn teardown_blocked_spill_anchors(&mut self) -> Vec<CellAddress> {
        let mut anchors: Vec<CellAddress> = self.blocked_anchor_addresses();
        anchors.sort_unstable_by_key(|a| (a.row, a.col));
        // Drain through the registry's own retire hook rather than
        // `HashMap::drain`, so the stage 2 rectangle claims go with the
        // anchors. Leaving them would strand `addr → anchor` entries pointing
        // at PRE-shift anchor addresses, and the first post-shift write into
        // one of those cells would try to re-project a formula that no longer
        // lives there.
        for anchor in &anchors {
            self.retire_blocked_anchor(*anchor);
        }
        anchors
    }

    /// AUDIT A-5 — re-run the eager array-formula maintenance at each
    /// (already shifted) anchor address after a structural edit.
    /// Addresses mapped into the deleted band carry the `REF_INVALID`
    /// sentinel and are skipped; anchors whose formula record was
    /// dropped by `drop_cells_in` are no-ops inside
    /// `recompute_array_formula`.
    ///
    /// Fed from BOTH pre-shift snapshots: the installed anchors returned
    /// by `teardown_all_spills` and the collided ones returned by
    /// `teardown_blocked_spill_anchors` (ADR 0006 stage 0). A collided
    /// anchor's `recompute_array_formula` either installs the spill (the
    /// obstruction moved out of the box) or re-registers the claim at its
    /// new address.
    ///
    /// `pub(crate)` for the same reason as `teardown_blocked_spill_anchors`
    /// above — `sort.rs` runs the same snapshot → move → re-derive pipeline.
    pub(crate) fn rederive_spill_anchors(&mut self, shifted_anchors: Vec<CellAddress>) {
        for addr in shifted_anchors {
            if addr.row == crate::shift::REF_INVALID_ROW
                || addr.col == crate::shift::REF_INVALID_COL
            {
                continue;
            }
            self.recompute_array_formula(addr);
        }
        // Re-deriving one anchor can tear another's projection down and free
        // the cell a third was blocked on; same drain as the write path.
        self.drain_teardown_driven_retries();
    }
}
