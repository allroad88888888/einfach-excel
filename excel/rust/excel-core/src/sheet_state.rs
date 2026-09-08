//! Sheet 的唯一状态布局。

use super::*;

/// A spreadsheet sheet backed by an atom store.
pub struct Sheet {
    pub(crate) store: Store,
    /// Number of store atoms THIS sheet created and still owns. With the
    /// P3 workbook-global shared store, `store.debug_total_atom_count()`
    /// counts every sheet's atoms; per-sheet probes and fences need the
    /// sheet-local number, maintained by the `owned_*` lifecycle wrappers
    /// (the only places this sheet creates or destroys atoms).
    /// Behind `Rc<Cell<_>>` so the P4c facade-creation context (`FacadeCtx`)
    /// can share the counter into `'static` inner-atom closures that mint
    /// dependent-cell facades on demand.
    pub(super) atoms_owned: Rc<Cell<usize>>,
    /// Shared cell/formula storage — see [`SheetInterior`] for the field
    /// docs and the P4a borrow rule.
    pub(crate) interior: Rc<SheetInterior>,
    /// P4b/P4c: per-address slot-epoch primitives. A cell's epoch atom is bumped
    /// whenever its inner atom identity changes (literal↔formula overwrite,
    /// clear). The facade derives off this so a swap re-runs the facade read
    /// without re-keying any subscription. Created lazily on first use and
    /// wired by the current read/write paths.
    /// Behind `Rc<RefCell<_>>` so `FacadeCtx` can share it into `'static`
    /// closures (see `cell_facade_family`).
    pub(super) slot_epoch_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4b: per-address facade derived atoms — the stable subscription anchor
    /// that replaces `AddressSubscriptionBucket` remapping. A facade reads its
    /// slot-epoch then the current inner atom for the address. Behind
    /// `Rc<RefCell<_>>` so the P4c `AtomEvalProvider` can capture a clone and
    /// resolve referenced cells' facades under `&self`. Created lazily.
    /// Wired by read paths and address subscriptions.
    pub(super) cell_facade_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4c: per-address formula-INNER derived atoms. Keyed by the anchor
    /// address of a formula cell; each runs the cell's `Expr` through an
    /// `AtomFormulaProvider`, resolving every referenced cell REACTIVELY via
    /// that cell's facade (`FacadeCtx::get_or_create_facade`). The facade for a
    /// formula address delegates to this inner atom, so a subscription anchored
    /// on the facade re-notifies when any read cell's value changes — no
    /// address-level point edge. Created lazily on first read of a formula cell.
    /// Behind `Rc<RefCell<_>>` so `FacadeCtx` shares it into `'static` closures.
    pub(super) formula_inner_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P5 Tier-B range geometry versions. Large range formulas depend on these
    /// Store roots by geometry; the atoms never name dependent formulas.
    pub(super) range_band_epoch_family: Rc<RefCell<AtomFamily<RangeBandKey>>>,
    pub(super) range_column_epoch_family: Rc<RefCell<AtomFamily<RangeColumnKey>>>,
    pub(super) range_sheet_epoch_family: Rc<RefCell<AtomFamily<()>>>,
    /// P4c: the shared set of addresses whose formula-inner atom is currently
    /// mid-evaluation (on the read stack). The runtime cycle guard (codex F1):
    /// before an `AtomFormulaProvider` calls `args.get` on a referenced cell's
    /// facade, it checks membership here; a hit means the reference closes a
    /// cycle, so it returns a sticky `#CYCLE!` and records the reverse edge via
    /// `ReadArgs::depend` (so a later edit that dissolves the cycle still
    /// re-invalidates). Each inner read_fn inserts its own address on entry and
    /// removes it on exit through an `InFlightGuard` RAII marker. Shared behind
    /// `Rc<RefCell<_>>` so every inner closure and `FacadeCtx` clone see one set.
    pub(super) in_flight: Rc<RefCell<HashSet<CellAddress>>>,
    /// Optional workbook scope. Standalone sheets leave this empty; workbook
    /// sheets point weakly at the shared topology/name/custom-function roots.
    pub(super) workbook_context: Rc<RefCell<Option<Weak<WorkbookAtomContext>>>>,
    pub(super) workbook_sheet_index: Rc<Cell<Option<usize>>>,
    /// Address-level subscriptions. Buckets are only wired to store atoms when
    /// the address has a materialized readable atom, so subscribing to an empty
    /// visible cell does not allocate a cell atom by itself.
    pub(super) cell_subscriptions: HashMap<CellAddress, AddressSubscriptionBucket>,
    pub(super) next_cell_sub_id: u64,
    /// 稀疏 cellStyle；只保存单元格自己明确接管的显示属性。
    pub(crate) cell_styles: HashMap<CellAddress, CellStyle>,
    /// 稀疏 rowStyle；行显示格式与行高共用这一份权威数据。
    pub(crate) row_styles: BTreeMap<u32, crate::cell_style::RowStyle>,
    /// 稀疏 columnStyle；列宽仍由 `SheetInterior::col_widths` 单独负责。
    pub(crate) column_styles: BTreeMap<u32, CellStyle>,
    /// 合并区域只记录不重叠的矩形；不为被覆盖的空格创建 atom 或样式副本。
    pub(crate) merged_ranges: Vec<CellRange>,
    /// Sheet-wide conditional formatting rules. Applied in order on top of
    /// each cell's base format at display time (first match wins).
    pub(super) conditional_rules: Vec<ConditionalRule>,
    // Column widths moved to `SheetInterior::col_widths` (shared `Rc`) so the
    // formula-inner provider can reach them for `CELL("width")`. The public
    // `set_col_width` / `col_width` / ... accessors below are unchanged and now
    // delegate into the interior.
    /// MANUALLY hidden rows, 0-based (E2 of `design-engine-hidden-rows.md`).
    /// The engine's OWNED copy of the fact — as opposed to
    /// `WorkbookAtomContext::eval_hidden_rows`, which is now a read-only
    /// evaluation mirror republished from here.
    ///
    /// Sits beside `row_styles` / `col_widths` because it is the same kind
    /// of fact: sparse, row-indexed, per-sheet dimension metadata that
    /// belongs to the sheet rather than to the workbook. Three consequences
    /// come free from the placement — `apply_structural_shift` displaces it
    /// in the same pass that displaces `row_styles`; `move_sheet` /
    /// `remove_sheet` carry it because they move the whole `Sheet`; and
    /// persistence-v1, which already walks sheets, can serialize it without
    /// a new keying scheme.
    ///
    /// Filter-hidden rows live in the SEPARATE `filter` field below, not
    /// merged in here: Excel's two SUBTOTAL layers need the manual/filter
    /// distinction (1-11 exclude filter-hidden rows only, 101-111 exclude
    /// both), and a merged set could not express that rule.
    pub(super) hidden_rows: BTreeSet<u32>,
    /// 手动隐藏列属于工作表元数据，不以零列宽或 UI 本地集合代替。
    pub(super) hidden_columns: BTreeSet<u32>,
    /// The sheet's AutoFilter — committed RULES plus the row set they
    /// DERIVED (E3 of `design-engine-hidden-rows.md`). `None` means no
    /// filter is active, which is the same observable state as an empty
    /// rule list: nothing hidden.
    ///
    /// Beside `hidden_rows` for the same reason `hidden_rows` is beside
    /// `row_styles`, and it inherits the same three freebies: structural
    /// displacement, sheet lifecycle, persistence-by-sheet-walk.
    ///
    /// The derived set is STORED rather than recomputed on demand, and that
    /// is load-bearing rather than an optimisation. #27 ruled that editing a
    /// cell does NOT recompute visibility (Excel snapshot semantics; the
    /// pre-#27 implementation recomputed on every revision bump, which made
    /// filtering *more live than Excel's*). A getter that re-ran the
    /// predicate would be live by construction. Only `apply_filter` /
    /// `reapply_filter` / `clear_filter` ever write this set — every other
    /// path (cell writes, structural edits, formats) at most DISPLACES the
    /// rows already in it.
    pub(super) filter: Option<crate::filter::SheetAutoFilter>,
    /// How many predicate scans this sheet has run. `Cell` because the scan
    /// itself runs behind `&self` (it must, so it can read cell values
    /// through the eager provider while `apply_filter` holds `&mut self`).
    ///
    /// Exists purely so tests can assert the negative that matters: that a
    /// cell write, a structural edit, or a hidden-row epoch bump does NOT
    /// re-run the predicate. "The count did not move" is the only direct
    /// evidence that visibility is a snapshot and not a derivation.
    pub(super) filter_scan_count: Cell<u64>,
    /// Cumulative count of completed formula-inner evaluations. Read-only
    /// debug counter used by the Phase 1 scale tests to assert laziness —
    /// `bulk_load` of N formulas
    /// must keep this at 0 until the first `get_cell`. `Cell` so the counter
    /// can be bumped from `&self` (eval runs through the immutable reader).
    pub(super) formula_eval_count: Rc<Cell<usize>>,
    /// Cumulative count of formulas inserted via `BulkLoader::set_formula`.
    /// Bumped once per successful entry inside `bulk_load`; the plain
    /// `Sheet::set_formula` path does NOT bump this. Used by the scale
    /// suite to verify "imported" vs "live-edited" formula provenance.
    pub(super) imported_formula_count: Cell<usize>,
    /// Cumulative number of formula-inner addresses discovered through Store
    /// reverse dependencies while mutation code prepares spill/subscriber
    /// maintenance. This remains a complexity probe; it is not a dirty graph.
    pub(super) reverse_dep_visit_count: Cell<u64>,

    /// Monotonic generation of same-sheet formula AST/source topology. A
    /// formula-content mutation bumps this value, invalidating every embedded
    /// static-cycle certificate in O(1). Hydration itself preserves topology
    /// and therefore transfers the current certificate without a bump.
    pub(super) formula_topology_epoch: Cell<u64>,
    /// Deterministic complexity probe: number of formula ASTs expanded by the
    /// install-time static cycle analyzer. It excludes Store evaluation.
    pub(super) static_cycle_node_visit_count: Cell<u64>,

    /// AUDIT B-5 — counts `has_address_subscribers` probes performed by
    /// `BulkLoader::flush`'s notify tail (one per entry of
    /// touched ∪ dirty). With zero address subscriptions the tail
    /// early-outs and this stays untouched — pinned by the scale suite
    /// so a 1M-cell restore never pays millions of hash probes to
    /// conclude nobody is watching.
    pub(super) bulk_notify_probe_count: Cell<u64>,

    // === Spill (dynamic-array) infrastructure ===
    //
    // Phase 1 wires the *plumbing* for dynamic-array spill. The atom-based
    // store already gives us correctly-derived dependent recompute and
    // subscription propagation — we don't need a parallel spill index or
    // look-aside table. Instead:
    //
    //   * The anchor cell's atom holds a `Value::Array`.
    //   * Each non-(0,0) target gets a NEW derived atom that reads the
    //     anchor and indexes into the array. We replace whatever was at
    //     that position in `Sheet::cells` with this derived atom.
    //   * On re-spill / clear, we remove those derived atoms from
    //     `Sheet::cells` and destroy them in the store. The single
    //     `spill_targets` map below records which atoms we installed so
    //     teardown is exact.
    //
    // Phase 1 limitations (documented in `register_spill` docs):
    //   - No auto-retry on conflict-resolve (clearing the obstructing
    //     cell does not retry the spill until the user re-evaluates).
    //   - No implicit array broadcast in arithmetic — Phase 3 work.
    //   - The JS / WASM boundary collapses `Value::Array` to its top-left
    //     element via `collapse_array_for_js`. JS never observes Array.
    /// Anchor atom → derived atoms we installed at the non-(0,0)
    /// spill targets. Stored by atom rather than address so the
    /// teardown path (`clear_spill`) does not need to re-resolve which
    /// addresses we wrote into — it already has the atom ids we
    /// allocated. Each target derived atom is also recorded in
    /// `Sheet::cells` under its target address so reads route through
    /// the normal cell-fetch path.
    ///
    /// `HashMap` rather than `BTreeMap` because `AtomId` deliberately
    /// does not derive `Ord` — atom-id ordering carries no semantic
    /// meaning and we never iterate this map in order.
    pub(super) spill_targets: HashMap<AtomId, Vec<CellAddress>>,
    /// AUDIT A-8 — reverse spill index: target address →
    /// `(anchor_atom, anchor_address)`. Maintained in lockstep with
    /// `spill_targets` (`register_spill` inserts, `clear_spill` removes,
    /// `bulk_install_storage` teardown clears) so the per-write spill
    /// guards (`spilled_into_anchor`, `is_target_occupied`) are O(1) map
    /// probes instead of a scan over every target list plus a reverse
    /// scan of `cells` — one `=SEQUENCE(100000)` must not make every
    /// keystroke O(100k).
    pub(super) spill_target_anchor: HashMap<CellAddress, (AtomId, CellAddress)>,
    /// A-8 follow-up (2026-06-13 P3) — anchor atom → anchor address.
    /// Maintained at exactly the same lockstep sites as
    /// `spill_target_anchor` (`register_spill` inserts, `clear_spill`
    /// removes, `bulk_install_storage` teardown clears) so
    /// `anchor_address_for` — called once per active spill by
    /// `teardown_all_spills` on EVERY structural edit — is one map
    /// probe instead of a reverse scan over all of `cells` per anchor.
    /// `spill_target_anchor` alone can't serve this lookup: anchors
    /// with zero targets (1×1 / empty arrays) have no entry there.
    /// `pub(crate)` so the sort module's spill-intersection gate can walk
    /// the anchor set in O(anchors) without a parallel index.
    pub(crate) spill_anchor_addr: HashMap<AtomId, CellAddress>,
    /// ADR 0006 stage 0/2 — formula anchors whose array is currently NOT
    /// installed because `register_spill` rejected the bounding box (an
    /// occupied target, or a box running off the grid), plus the cells each
    /// one wanted.
    ///
    /// The type, its two caps, and the full INV-2 compliance argument live in
    /// the dedicated module `sheet_spill_claims.rs` — allowlisted
    /// address-keyed indexes are kept out of this file on purpose, so
    /// `tests/architecture_invariants.rs` can keep banning their shapes here
    /// outright (it scans the claims module too).
    ///
    /// Such an anchor deliberately has NO entry in the three maps above:
    /// those describe an *installed* projection and a collided anchor
    /// installed nothing. That is correct, but it made the anchor
    /// invisible to `teardown_all_spills`, which enumerates
    /// `spill_targets` — so structural edits never retried it. And
    /// `Error(Spill)` is a STICKY primitive in `cells[addr]` (the facade
    /// prefers it over formula-inner, `relocate_cells` carries it
    /// verbatim), so an edit that shifted the obstruction out of the
    /// rectangle left the anchor reading `#SPILL!` forever.
    ///
    /// Keyed by ADDRESS, not by atom, for two reasons: a collided anchor
    /// has no distinguished "spill anchor atom" to hang the entry on, and
    /// the sole consumer (`apply_structural_shift`) already speaks in
    /// pre-shift addresses that it maps through `ShiftEdit::apply`.
    ///
    /// Deliberately NOT folded into `spill_anchor_addr`: `sort.rs`'s §5.1
    /// gate walks that map and derives a rectangle per anchor, and a
    /// collided anchor has no rectangle — folding it in would make sort
    /// reject ranges over a phantom 1×1 rect it never actually owns.
    ///
    /// Only *formula* anchors are registered. `set_array`'s collision path
    /// overwrites the anchor atom with `Error(Spill)`, destroying the only
    /// copy of the array, so there is nothing left to re-derive from and
    /// `recompute_array_formula` correctly no-ops on it — an entry there
    /// could never be retired.
    ///
    /// Size is bounded by the number of anchors currently reading
    /// `#SPILL!`: `recompute_array_formula` drops the entry on entry and
    /// re-adds it only if the retry collides again, every public write
    /// funnels through `clear_spill_at_address`, and
    /// `apply_structural_shift` drains the whole set and lets the
    /// re-derive rebuild it.
    pub(super) spill_blocked: spill_claims::BlockedClaims,
}
