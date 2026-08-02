//! ADR 0006 stage 2 — the *blocked* half of the spill registry: which formula
//! anchors are currently projecting `#SPILL!`, and which cells they would have
//! owned if nothing were in the way.
//!
//! Its sibling `sheet_spill.rs` owns the INSTALLED projection (an anchor that
//! actually spilled). A collided anchor installs nothing, so it has no entry in
//! any of those tables; this module is the parallel bookkeeping that makes such
//! an anchor findable again.
//!
//! # Why it exists
//!
//! When `register_spill` hits an obstruction it returns `Err(ValueError::Spill)`
//! and leaves no trace. Before stage 2 that meant the engine could not get from
//! the obstructing ADDRESS back to the anchor, so removing the obstruction never
//! revived the array (`spill_infra.rs`'s old
//! `collision_does_not_auto_retry_on_clear` pinned exactly that). Excel — and
//! `excel/excel-core-ts`, this repo's reference engine — revive it. The
//! `addr → anchor` direction below is what closes that gap.
//!
//! # INV-2 compliance (`excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`)
//!
//! INV-2 forbids "a map keyed by cell address whose values name dependent
//! formula cells", and explicitly allowlists *"spill `claims` (addr → anchor
//! ownership, not a dep)"*. `BlockedClaims` below is that allowlisted shape, for
//! four reasons that were checked one by one rather than assumed:
//!
//! 1. **Same shape as the already-allowlisted index.** The installed side,
//!    `Sheet::spill_target_anchor`, is `addr → anchor` and lives under the same
//!    allowlist clause. The blocked side is the identical relation over the
//!    identical key space; the only difference is that the projection failed.
//!    A rule that admits one and rejects the other would be arbitrary.
//! 2. **It records geometry, not dependency.** An entry says "this cell falls
//!    inside the rectangle anchor A claims", which is derivable at any moment
//!    from A's address and its array's shape — both facts the Store already
//!    holds. It is a materialised *spatial* predicate, exactly like the range
//!    family's allowlisted `addr → band atom` coverage index. It is NOT derived
//!    from A's formula text, its references, or its dependency closure.
//! 3. **It never decides a VALUE.** Nothing reads this registry to compute,
//!    refresh or invalidate a cell value. `recompute_array_formula` still gets
//!    the anchor's value from `formula_inner_of(addr)` — a Store derivation —
//!    and the collision verdict still comes from `is_target_occupied` reading
//!    live cell content. Deleting this whole module would not change a single
//!    value the engine can produce; it would only change *when* the engine
//!    notices, which is the same fallback-ladder rung the plan pre-approves
//!    ("eager engine-side spill maintenance, public setters only").
//! 4. **Store edges cannot express it, in principle.** A spill collision is an
//!    anti-dependency: anchor A is `#SPILL!` *because* nothing links it to the
//!    obstruction. A's formula never reads the obstructing cell, so no Store
//!    edge to it exists or could exist without fabricating a dependency that
//!    does not semantically hold. INV-2 governs the edges that decide recompute
//!    for values; it cannot govern a relation the value graph is definitionally
//!    unable to carry.
//!
//! The honest counter-argument — "it does decide *what* re-runs when a cell
//! changes, which is what INV-2 is about" — was weighed and does not hold here:
//! what it triggers is a *projection* refresh (re-running a geometric
//! placement), not a value recomputation, and the trigger is best-effort by
//! construction. Past the caps below the engine simply does not notice until
//! the next structural edit, and nothing is wrong — the anchor is still
//! `#SPILL!`, which is still the correct value. A dependency edge may not be
//! best-effort; this may. That asymmetry is the test that separates the two,
//! and it is why the ADR's approval note ("side indexes still collapse to
//! `claims`") reads soundly rather than as a loophole.
//!
//! Because a *shape*-based tripwire cannot tell "anchor ownership" from
//! "dependent formulas", `tests/architecture_invariants.rs` bans the literal
//! shapes outright and expects allowlisted indexes to live in their own module
//! with their own named types — `spill_target_anchor` already does this with a
//! tuple value. `ClaimOwners` is the same move, and this file is included in
//! that test's scanned sources so the ban is enforced here too rather than
//! merely side-stepped.
//!
//! # Bounds
//!
//! Both caps below exist because this repo requires a bounded cache to declare
//! its cap. Over a cap the anchor still parks in the registry (so structural
//! edits still retry it) — only the auto-revive-on-clear affordance degrades,
//! back to exactly the pre-ADR behaviour.

use std::collections::HashMap;

use crate::cell::CellAddress;

use super::{Sheet, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};

/// Largest would-be rectangle (in cells) whose claims get registered.
///
/// Chosen to match `RANGE_BAND_DEP_LIMIT`, the crate's existing "this much
/// per-cell bookkeeping is affordable" line. It covers every hand-authored
/// dynamic array a user can plausibly type (a 4096-row column, or a 64×64
/// block) while keeping the pathological case cheap: `=SEQUENCE(1000000)`
/// blocked by one cell would otherwise mint a million claims on every failed
/// recompute — and pay to delete them again on the next write.
const CLAIM_RECT_LIMIT: u64 = 4_096;

/// Backstop on the whole registry, across all blocked anchors.
///
/// The per-anchor cap alone leaves the total proportional to the number of
/// simultaneously-`#SPILL!` anchors, which a generated workbook could push
/// arbitrarily high. 16 maximally-sized blocked rectangles is already far
/// beyond anything observed; past it, later anchors register no claims and fall
/// back to structural-edit retries.
const CLAIM_TOTAL_LIMIT: usize = 65_536;

/// The anchors claiming one cell, kept sorted row-major.
///
/// A named type rather than a bare `Vec<CellAddress>`: two blocked anchors can
/// want the same cell, and removing the obstruction must retry BOTH, with the
/// row-major order — not a hash seed — deciding who wins.
#[derive(Default)]
struct ClaimOwners {
    anchors: Vec<CellAddress>,
}

impl ClaimOwners {
    fn insert(&mut self, anchor: CellAddress) {
        let key = (anchor.row, anchor.col);
        if let Err(pos) = self.anchors.binary_search_by_key(&key, |a| (a.row, a.col)) {
            self.anchors.insert(pos, anchor);
        }
    }

    fn remove(&mut self, anchor: CellAddress) {
        self.anchors.retain(|&a| a != anchor);
    }
}

/// Anchors currently projecting `#SPILL!`, plus the cells each one wanted.
///
/// The two halves move together through `register` / `retire`, which is what
/// keeps a claim from ever naming an anchor that is no longer blocked.
#[derive(Default)]
pub(super) struct BlockedClaims {
    /// Anchor address → the `(rows, cols)` shape its array wanted. The shape is
    /// what lets `retire` sweep the rectangle back out without re-evaluating
    /// the formula.
    anchors: HashMap<CellAddress, (u32, u32)>,
    /// Cell inside some blocked anchor's would-be rectangle → the anchors that
    /// want it. This is the `addr → anchor` direction stage 2 exists to add.
    claims: HashMap<CellAddress, ClaimOwners>,
    /// Anchors owed a retry because a spill TEARDOWN — not a write — freed a
    /// cell they claim.
    ///
    /// The write paths sample `claims` themselves, before the mutation, and put
    /// the owners straight into their re-projection set. That misses one route:
    /// withdrawing array X empties every cell X was projecting into, and one of
    /// those may be exactly what was blocking array Y. The address the USER
    /// touched (X's anchor) carries no claim of Y's, so nothing in the write's
    /// own bookkeeping names Y. `Sheet::clear_spill` posts here instead, and the
    /// re-projection pass drains it.
    pending: Vec<CellAddress>,
}

impl BlockedClaims {
    fn is_empty(&self) -> bool {
        self.anchors.is_empty()
    }

    /// Walk every non-anchor cell of the rectangle `shape` anchored at
    /// `anchor`, stopping at the grid edge. The anchor is skipped because a
    /// write there replaces the formula outright — `clear_spill_at_address`
    /// already handles that, and a self-claim would make every anchor overwrite
    /// look like an obstruction removal.
    fn for_each_rect_cell(anchor: CellAddress, shape: (u32, u32), mut f: impl FnMut(CellAddress)) {
        let (rows, cols) = shape;
        for di in 0..rows {
            for dj in 0..cols {
                if di == 0 && dj == 0 {
                    continue;
                }
                let (Some(row), Some(col)) =
                    (anchor.row.checked_add(di), anchor.col.checked_add(dj))
                else {
                    continue;
                };
                if row >= EXCEL_MAX_ROWS || col >= EXCEL_MAX_COLS {
                    continue;
                }
                f(CellAddress::new(row, col));
            }
        }
    }

    fn rect_cells(shape: (u32, u32)) -> u64 {
        (shape.0 as u64) * (shape.1 as u64)
    }

    fn register(&mut self, anchor: CellAddress, shape: (u32, u32)) {
        // Retire first: a re-registration at the same address may carry a
        // different shape (the formula's array grew or shrank), and stale
        // claims from the old rectangle would then revive the anchor on writes
        // to cells it no longer wants.
        self.retire(anchor);
        self.anchors.insert(anchor, shape);

        let cells = Self::rect_cells(shape);
        if cells > CLAIM_RECT_LIMIT
            || self.claims.len().saturating_add(cells as usize) > CLAIM_TOTAL_LIMIT
        {
            // Over cap: the anchor is still findable by structural edits, it
            // just will not auto-revive when the obstruction is cleared.
            // `retire` applies the same per-anchor test, so it will not try to
            // remove claims we never made.
            return;
        }
        let claims = &mut self.claims;
        Self::for_each_rect_cell(anchor, shape, |cell| {
            claims.entry(cell).or_default().insert(anchor);
        });
    }

    fn retire(&mut self, anchor: CellAddress) {
        let Some(shape) = self.anchors.remove(&anchor) else {
            return;
        };
        if Self::rect_cells(shape) > CLAIM_RECT_LIMIT {
            // Never registered (per-anchor cap) — nothing to sweep. The TOTAL
            // cap is deliberately not re-tested here: it depends on the map's
            // size at registration time, which has since moved. Sweeping a
            // rectangle that has no entries is harmless — every probe is a
            // miss — so the cheap conservative test is the right one.
            return;
        }
        let claims = &mut self.claims;
        Self::for_each_rect_cell(anchor, shape, |cell| {
            let Some(owners) = claims.get_mut(&cell) else {
                return;
            };
            owners.remove(anchor);
            if owners.anchors.is_empty() {
                claims.remove(&cell);
            }
        });
    }

    fn owners_of(&self, addr: CellAddress) -> Vec<CellAddress> {
        self.claims
            .get(&addr)
            .map(|o| o.anchors.clone())
            .unwrap_or_default()
    }

    fn anchor_addresses(&self) -> Vec<CellAddress> {
        self.anchors.keys().copied().collect()
    }

    fn shape_of(&self, anchor: CellAddress) -> Option<(u32, u32)> {
        self.anchors.get(&anchor).copied()
    }

    fn note_freed(&mut self, cell: CellAddress) {
        if let Some(owners) = self.claims.get(&cell) {
            self.pending.extend_from_slice(&owners.anchors);
        }
    }

    fn drain_pending(&mut self) -> Vec<CellAddress> {
        let mut out = std::mem::take(&mut self.pending);
        // Sorted + deduped for the same reason every other spill list is: the
        // retry order is observable when two anchors want one rectangle, and it
        // must be a property of the sheet rather than of insertion history.
        out.sort_unstable_by_key(|a| (a.row, a.col));
        out.dedup();
        out
    }

    fn clear(&mut self) {
        self.anchors.clear();
        self.claims.clear();
        self.pending.clear();
    }
}

impl Sheet {
    /// Park `anchor` as blocked and, when the rectangle fits the caps, claim
    /// every cell it wanted.
    ///
    /// Called from the two `Err` arms of `recompute_array_formula` — the only
    /// places an anchor can enter the collided state — so registration and the
    /// `#SPILL!` projection are written together and cannot drift.
    pub(super) fn register_blocked_anchor(&mut self, anchor: CellAddress, shape: (u32, u32)) {
        self.spill_blocked.register(anchor, shape);
    }

    /// Inverse of `register_blocked_anchor`. Idempotent — every write path
    /// calls it unconditionally through `clear_spill_at_address`.
    pub(super) fn retire_blocked_anchor(&mut self, anchor: CellAddress) {
        self.spill_blocked.retire(anchor);
    }

    /// True when no anchor is currently blocked. Lets the hot write path skip
    /// the registry with a field read instead of two hash probes — the
    /// overwhelmingly common sheet has no `#SPILL!` on it at all.
    pub(super) fn has_blocked_anchors(&self) -> bool {
        !self.spill_blocked.is_empty()
    }

    /// Anchors that claim `addr`, row-major. The caller feeds these into the
    /// re-projection set so a write that may have freed the rectangle gets the
    /// array re-tried.
    ///
    /// Retrying is unconditional rather than "only when the write cleared
    /// something": `recompute_array_formula` re-runs the real collision test,
    /// so a write that swaps one blocker for another simply re-registers the
    /// claim. That keeps this lookup free of any notion of what a value means.
    pub(super) fn blocked_anchors_claiming(&self, addr: CellAddress) -> Vec<CellAddress> {
        if self.spill_blocked.is_empty() {
            return Vec::new();
        }
        self.spill_blocked.owners_of(addr)
    }

    /// Every blocked anchor address. Sorted by the caller.
    pub(super) fn blocked_anchor_addresses(&self) -> Vec<CellAddress> {
        self.spill_blocked.anchor_addresses()
    }

    /// The `(rows, cols)` rectangle `anchor` wanted, or `None` when `anchor` is
    /// not currently blocked. `Some` is therefore also the authoritative test
    /// for "this address is projecting `#SPILL!`".
    ///
    /// Recorded for EVERY blocked anchor regardless of the two caps above —
    /// `register` inserts into `anchors` before testing them, and only the
    /// per-cell `claims` are skipped past a cap. `sheet_spill_blocker.rs`
    /// depends on that: it must be able to answer "who is blocking you" for a
    /// million-cell array too, which is exactly the case that registers no
    /// claims.
    pub(super) fn blocked_anchor_shape(&self, anchor: CellAddress) -> Option<(u32, u32)> {
        self.spill_blocked.shape_of(anchor)
    }

    /// Report that a spill teardown just emptied `cell`, so any blocked anchor
    /// claiming it is owed a retry. Called once per released projection cell by
    /// `clear_spill`; the registry-empty guard keeps that loop at one field read
    /// per cell on the overwhelmingly common sheet with no `#SPILL!` on it.
    pub(super) fn note_freed_spill_cell(&mut self, cell: CellAddress) {
        self.spill_blocked.note_freed(cell);
    }

    /// Take the anchors owed a teardown-driven retry, row-major and deduped.
    pub(super) fn drain_blocked_anchor_retries(&mut self) -> Vec<CellAddress> {
        self.spill_blocked.drain_pending()
    }

    /// Drop the whole registry. Bulk install replaces every fact on the sheet,
    /// so blocked anchors are re-discovered by `install_bulk_spill_projections`.
    pub(super) fn clear_blocked_anchor_registry(&mut self) {
        self.spill_blocked.clear();
    }

    /// Number of formula anchors parked in the blocked registry — anchors
    /// currently projecting `#SPILL!` with no targets installed. Leak probe:
    /// it must fall back to its baseline once the obstruction is removed or the
    /// anchor is overwritten, and it must never count an anchor that spilled
    /// cleanly (those live in `spill_targets` instead).
    #[doc(hidden)]
    pub fn debug_spill_blocked_anchor_count(&self) -> usize {
        self.spill_blocked.anchors.len()
    }

    /// Number of CELLS carrying at least one blocked claim (ADR 0006 stage 2).
    /// Leak probe companion to `debug_spill_blocked_anchor_count`: it must
    /// return to its baseline whenever the anchor count does, and it must stay
    /// at the baseline for anchors whose rectangle exceeded the per-anchor cap.
    #[doc(hidden)]
    pub fn debug_spill_blocked_claim_count(&self) -> usize {
        self.spill_blocked.claims.len()
    }
}
