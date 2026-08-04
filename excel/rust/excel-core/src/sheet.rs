use std::cell::{Cell, RefCell};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::hash::Hash;
use std::rc::{Rc, Weak};

use std::sync::Arc;

use einfach_core::{
    ArrayData, AtomFamily, AtomId, CellListener, ReadArgs, Store, SubscriptionId, Value, ValueError,
};

use crate::cell::CellAddress;
use crate::eval::{eval_expr_with_provider, CustomFunctionRegistry, EvalProvider, ResolvedTable};
use crate::format::{apply_rules, CellFormat, ConditionalRule};
use crate::formula::{parse_formula, Expr, RangeBounds};
use crate::range::CellRange;

// Dynamic-array spill lives in three child modules rather than in this file:
// `spill` owns the *installed* projection state (the bookkeeping tables
// declared on `Sheet` below, plus install / teardown), `spill_claims` owns the
// BLOCKED side (anchors currently projecting `#SPILL!` and the rectangle they
// would have owned), `spill_maintenance` owns the re-projection triggers, and
// `spill_blocker` answers the one diagnostic question those three do not —
// which cell is blocking a given `#SPILL!`. They are children of `sheet`, not
// siblings in `lib.rs`, so they keep reading `Sheet`'s private fields and
// helpers without anything being widened — `pub(super)` there spans exactly
// what plain `fn` spanned here. `#[path]` keeps all four files flat in `src/`.
#[path = "sheet_spill.rs"]
mod spill;
#[path = "sheet_spill_blocker.rs"]
mod spill_blocker;
#[path = "sheet_spill_claims.rs"]
mod spill_claims;
#[path = "sheet_spill_maintenance.rs"]
mod spill_maintenance;

// 生产代码按职责拆到下面这些子模块里（`#[path]` 让文件在 `src/` 下保持扁平，
// 与既有的 `sheet_spill*.rs` 同一套做法）。它们是 `sheet` 的子模块，因此
// 照旧读得到 `Sheet` 的私有字段；原先的私有项在那边写成 `pub(super)`。
#[path = "sheet_array_gate.rs"]
mod array_gate;
#[path = "sheet_async_custom.rs"]
mod async_custom;
#[path = "sheet_atom_gc.rs"]
mod atom_gc;
#[path = "sheet_batch.rs"]
mod batch;
#[path = "sheet_bulk_formula.rs"]
mod bulk_formula;
#[path = "sheet_bulk_install.rs"]
mod bulk_install;
#[path = "sheet_bulk_loader.rs"]
mod bulk_loader;
#[path = "sheet_bulk_parsed.rs"]
mod bulk_parsed;
#[path = "sheet_cell_slot.rs"]
mod cell_slot;
#[path = "sheet_debug_atoms.rs"]
mod debug_atoms;
#[path = "sheet_debug_deps.rs"]
mod debug_deps;
#[path = "sheet_dimensions.rs"]
mod dimensions;
#[path = "sheet_error.rs"]
mod error;
#[path = "sheet_eval_provider.rs"]
mod eval_provider;
#[path = "sheet_expr_refs.rs"]
mod expr_refs;
#[path = "sheet_facade.rs"]
mod facade;
#[path = "sheet_filter.rs"]
mod filter;
#[path = "sheet_format.rs"]
mod format;
#[path = "sheet_hidden_rows.rs"]
mod hidden_rows;
#[path = "sheet_hydrate.rs"]
mod hydrate;
#[path = "sheet_in_flight.rs"]
mod in_flight;
#[path = "sheet_range_tiers.rs"]
mod range_tiers;
#[path = "sheet_relocate.rs"]
mod relocate;
#[path = "sheet_retarget.rs"]
mod retarget;
#[path = "sheet_row_major_map.rs"]
mod row_major_map;
#[path = "sheet_scan.rs"]
mod scan;
#[path = "sheet_structural.rs"]
mod structural;
#[path = "sheet_subscribe.rs"]
mod subscribe;
#[path = "sheet_workbook_topology.rs"]
mod workbook_topology;
#[path = "sheet_write_clear.rs"]
mod write_clear;
#[path = "sheet_write_formula.rs"]
mod write_formula;
#[path = "sheet_write_value.rs"]
mod write_value;

use self::async_custom::*;
use self::cell_slot::*;
use self::eval_provider::*;
use self::expr_refs::*;
use self::hidden_rows::*;
use self::in_flight::*;
use self::range_tiers::*;
use self::row_major_map::*;
use self::scan::*;
use self::subscribe::*;
use self::workbook_topology::*;

pub use self::async_custom::PendingAsyncCustomCall;
pub use self::bulk_loader::BulkLoader;
pub use self::debug_deps::DepGraphStats;
pub use self::error::SheetError;
pub use self::format::{FormatRangeSnapshot, RangeFormatSnapshotLayer};
pub use self::subscribe::CellSubscription;
pub(crate) use self::array_gate::{expr_may_produce_array, source_may_produce_array};
pub(crate) use self::async_custom::ASYNC_CUSTOM_RESULT_CACHE_CAP;
pub(crate) use self::bulk_install::BulkInstallCleanup;
pub(crate) use self::eval_provider::collapse_array_for_eval;
pub(crate) use self::format::RangeFormat;
pub(crate) use self::workbook_topology::ProjectedTable;


pub(crate) const EXCEL_MAX_ROWS: u32 = 1_048_576;
pub(crate) const EXCEL_MAX_COLS: u32 = 16_384;





















pub(crate) struct FormulaRecord {
    expr: Rc<Expr>,
    /// Formula-topology generation in which static analysis proved this
    /// address is not a member of a same-sheet dependency cycle. This is a
    /// validation certificate only: Store edges remain the sole reactive
    /// dependency graph and the stamp never participates in recomputation.
    cycle_checked_at: Cell<u64>,
    /// Static point-cell references (`Expr::CellRef`, plus bounded range
    /// cells expanded by `collect_refs`). Kept on the record for structural
    /// retargeting and debug probes; reactive same-sheet invalidation is
    /// owned by the atom store.
    deps: RefCell<HashSet<CellAddress>>,
    /// Static `Expr::Range` metadata used by structural retargeting and cycle
    /// checks. Same-sheet invalidation is owned exclusively by Store edges.
    static_ranges: RefCell<HashSet<CellRange>>,
}

impl FormulaRecord {
    fn new(expr: Rc<Expr>, deps: HashSet<CellAddress>, static_ranges: HashSet<CellRange>) -> Self {
        FormulaRecord {
            expr,
            cycle_checked_at: Cell::new(0),
            deps: RefCell::new(deps),
            static_ranges: RefCell::new(static_ranges),
        }
    }
}

/// Raw bulk-loaded formula source plus its static-cycle validation stamp.
/// Keeping the stamp on the already-retained parked entry avoids introducing
/// a second address-keyed cache or dependency graph.
#[derive(Clone)]
pub(crate) struct ParkedFormula {
    source: Rc<str>,
    cycle_checked_at: Cell<u64>,
}

impl ParkedFormula {
    fn new(source: impl Into<Rc<str>>) -> Self {
        Self {
            source: source.into(),
            cycle_checked_at: Cell::new(0),
        }
    }
}

struct StaticCycleNode {
    addr: CellAddress,
    expr: Rc<Expr>,
    edges: Vec<usize>,
}

#[derive(Clone, Copy)]
struct StaticCycleCheckOutcome {
    closes_cycle: bool,
    target_certified: bool,
}

fn normalize_formula_cell_result(value: Value) -> Value {
    match value {
        Value::Lambda(_) => Value::Error(ValueError::Calc),
        other => other,
    }
}










/// Shared interior cell/formula storage (P4a of the atom-delegation
/// rewrite — see `excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`). Holds the
/// per-sheet state that formula read-closures will later (P4c) need to
/// reach from inside the store via a `Weak<SheetInterior>` capture, so
/// it lives behind an `Rc` on [`Sheet`] instead of as direct fields.
///
/// BORROW RULE (D7 corollary): no borrow of any field here may be held
/// across a `store.*` call, an `owned_*` wrapper, subscriber/listener
/// dispatch, or any `Sheet` method that might re-borrow the same field.
/// Pattern: borrow → copy out (clone the `Value` / copy the `AtomId` /
/// collect into a `Vec`) → release the guard → act.
pub(crate) struct SheetInterior {
    /// Primitive cell slots keyed by `(row, col)`. Backed by a row-major
    /// `RowMajorMap` so range reads (e.g. viewport, `SUM(A1:A100)`) scan
    /// O(cells_in_range) rather than the full non-empty set — the Phase 2
    /// Track F target from `PHASE2_PARALLEL.md`. API surface still mimics
    /// `HashMap` (`get`/`insert`/`remove`/`contains_key`/`len`/`keys`).
    ///
    /// AUDIT B-2: slots are either `Plain(Value)` (lazily atomized — the
    /// bulk-install fast path) or `Atom(AtomId)` (materialized). See
    /// [`CellSlot`] for the invariants.
    pub(crate) cells: RefCell<RowMajorMap<CellSlot>>,
    /// Formula structural records live at the Sheet layer. Hydrated same-sheet
    /// formula results are derived and cached by Store formula-inner atoms.
    /// Same row-major shape as `cells` keeps range scans over mixed
    /// primitive/formula cells O(matches).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` so `hydrate_formula(&self)`
    /// can install a freshly-parsed record without taking `&mut self`.
    /// Read paths consult the map via short `borrow()` snapshots that
    /// clone `Rc<FormulaRecord>` and release the borrow before any
    /// recursive eval (which might re-enter through another read /
    /// hydration). Iteration patterns snapshot keys first to avoid
    /// holding the borrow across a possible `borrow_mut`.
    pub(crate) formula_cells: RefCell<RowMajorMap<Rc<FormulaRecord>>>,
    /// AST of each formula cell, used for static cycle detection (B.2).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` so the hydrator can
    /// insert during a `&self` read. Same recursion-safety pattern as
    /// `formula_cells`.
    pub(crate) formula_exprs: RefCell<HashMap<CellAddress, Rc<Expr>>>,
    /// Original formula text per cell, for `get_formula` so the formula bar
    /// and edit-mode entry can show the source instead of the computed
    /// result (D.11).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` for the same hydrator-
    /// from-`&self` reason.
    pub(crate) formula_texts: RefCell<HashMap<CellAddress, String>>,
    /// Lazy-load source storage (Phase 2 of LAZY_FORMULA_INDEXING). Holds
    /// the raw formula text for cells that came in via `bulk_load` and
    /// have NOT yet been parsed / indexed. Mirrors `formula_cells` in
    /// row-major shape so range scans still cost O(cells_in_range), but
    /// each entry is raw source plus one static-validation generation stamp:
    /// no AST, reference set, `FormulaRecord`, or formula-inner derived atom.
    /// Entries are drained
    /// into `formula_cells` / `formula_exprs` / `formula_texts` by
    /// `hydrate_formula` once a read first touches them.
    ///
    /// Co-existence rule: `formula_source.contains_key(addr)` ↔
    /// `needs_parse.contains(addr)`. While the addr is unhydrated:
    ///   - `formula_cells` does NOT have an entry
    ///   - `formula_exprs` does NOT have an entry
    ///   - `formula_texts` does NOT have an entry
    ///   - same-sheet Store edges are absent until the facade/formula-inner
    ///     path materializes; Tier-B geometry roots stay unmaterialized
    /// Hydration moves the source out of `formula_source` and into the
    /// eager state atomically (single-threaded — no races).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: wrapped in `RefCell` so the
    /// hydrator (which runs from `&self` contexts) can both read the
    /// source and remove the entry after install.
    pub(crate) formula_source: RefCell<RowMajorMap<ParkedFormula>>,
    /// Lazy-load index of unparsed formulas. `RefCell` because read-only
    /// entry points (`peek_value_with_provider`, sparse-iter resolvers,
    /// cycle checks) need to drain entries as part of hydration without
    /// taking `&mut self`.
    ///
    /// Invariant: a single address appears in `needs_parse` iff it also
    /// appears as a key in `formula_source`. Hydration removes from both
    /// in lockstep.
    pub(crate) needs_parse: RefCell<HashSet<CellAddress>>,
    /// Sparse column widths in physical pixels, keyed by 0-based column
    /// (absent → UI default). Lives in the shared interior — rather than
    /// beside `row_heights` on [`Sheet`] — because a formula-inner read_fn
    /// ([`AtomFormulaProvider`], reachable only through the `FacadeCtx`'s
    /// `Rc<SheetInterior>`) needs it to answer `CELL("width")`. `row_heights`
    /// stays on `Sheet`: no formula reads a row height (Excel has no
    /// `CELL("height")` info_type). Read UNTRACKED (no dependency edge): a bare
    /// column resize does not itself re-derive an existing `CELL("width")`
    /// formula — consistent with `set_col_width` driving no recompute anywhere
    /// today. Same D7 borrow rule as the other interior fields (borrow → copy
    /// out → release; never hold across a `store.*` call).
    pub(crate) col_widths: RefCell<BTreeMap<u32, u32>>,
}

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
    atoms_owned: Rc<Cell<usize>>,
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
    slot_epoch_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4b: per-address facade derived atoms — the stable subscription anchor
    /// that replaces `AddressSubscriptionBucket` remapping. A facade reads its
    /// slot-epoch then the current inner atom for the address. Behind
    /// `Rc<RefCell<_>>` so the P4c `AtomEvalProvider` can capture a clone and
    /// resolve referenced cells' facades under `&self`. Created lazily.
    /// Wired by read paths and address subscriptions.
    cell_facade_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4c: per-address formula-INNER derived atoms. Keyed by the anchor
    /// address of a formula cell; each runs the cell's `Expr` through an
    /// `AtomFormulaProvider`, resolving every referenced cell REACTIVELY via
    /// that cell's facade (`FacadeCtx::get_or_create_facade`). The facade for a
    /// formula address delegates to this inner atom, so a subscription anchored
    /// on the facade re-notifies when any read cell's value changes — no
    /// address-level point edge. Created lazily on first read of a formula cell.
    /// Behind `Rc<RefCell<_>>` so `FacadeCtx` shares it into `'static` closures.
    formula_inner_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P5 Tier-B range geometry versions. Large range formulas depend on these
    /// Store roots by geometry; the atoms never name dependent formulas.
    range_band_epoch_family: Rc<RefCell<AtomFamily<RangeBandKey>>>,
    range_column_epoch_family: Rc<RefCell<AtomFamily<RangeColumnKey>>>,
    range_sheet_epoch_family: Rc<RefCell<AtomFamily<()>>>,
    /// P4c: the shared set of addresses whose formula-inner atom is currently
    /// mid-evaluation (on the read stack). The runtime cycle guard (codex F1):
    /// before an `AtomFormulaProvider` calls `args.get` on a referenced cell's
    /// facade, it checks membership here; a hit means the reference closes a
    /// cycle, so it returns a sticky `#CYCLE!` and records the reverse edge via
    /// `ReadArgs::depend` (so a later edit that dissolves the cycle still
    /// re-invalidates). Each inner read_fn inserts its own address on entry and
    /// removes it on exit through an `InFlightGuard` RAII marker. Shared behind
    /// `Rc<RefCell<_>>` so every inner closure and `FacadeCtx` clone see one set.
    in_flight: Rc<RefCell<HashSet<CellAddress>>>,
    /// Optional workbook scope. Standalone sheets leave this empty; workbook
    /// sheets point weakly at the shared topology/name/custom-function roots.
    workbook_context: Rc<RefCell<Option<Weak<WorkbookAtomContext>>>>,
    workbook_sheet_index: Rc<Cell<Option<usize>>>,
    /// Address-level subscriptions. Buckets are only wired to store atoms when
    /// the address has a materialized readable atom, so subscribing to an empty
    /// visible cell does not allocate a cell atom by itself.
    cell_subscriptions: HashMap<CellAddress, AddressSubscriptionBucket>,
    next_cell_sub_id: u64,
    /// Per-cell formatting (Phase 6). Independent of the dep graph; format
    /// changes never trigger formula recompute. Entry absent → default.
    /// `pub(crate)` so the sort module's layer materialize+cut preprocessing
    /// (`sort.rs`) can rewrite entries in place.
    pub(crate) formats: HashMap<CellAddress, CellFormat>,
    /// Ordered range-format layers. Later entries win. The format lookup order
    /// is reversed so overlapping ranges resolve to the most recently added
    /// matching layer. `pub(crate)` for the sort module (see `formats`).
    pub(crate) range_formats: Vec<RangeFormat>,
    /// Sheet-wide conditional formatting rules. Applied in order on top of
    /// each cell's base format at display time (first match wins).
    conditional_rules: Vec<ConditionalRule>,
    /// Sparse row heights in physical pixels. Absent means the UI default.
    row_heights: BTreeMap<u32, u32>,
    // Column widths moved to `SheetInterior::col_widths` (shared `Rc`) so the
    // formula-inner provider can reach them for `CELL("width")`. The public
    // `set_col_width` / `col_width` / ... accessors below are unchanged and now
    // delegate into the interior.
    /// MANUALLY hidden rows, 0-based (E2 of `design-engine-hidden-rows.md`).
    /// The engine's OWNED copy of the fact — as opposed to
    /// `WorkbookAtomContext::eval_hidden_rows`, which is now a read-only
    /// evaluation mirror republished from here.
    ///
    /// Sits beside `row_heights` / `col_widths` because it is the same kind
    /// of fact: sparse, row-indexed, per-sheet dimension metadata that
    /// belongs to the sheet rather than to the workbook. Three consequences
    /// come free from the placement — `apply_structural_shift` displaces it
    /// in the same pass that displaces `row_heights`; `move_sheet` /
    /// `remove_sheet` carry it because they move the whole `Sheet`; and
    /// persistence-v1, which already walks sheets, can serialize it without
    /// a new keying scheme.
    ///
    /// Filter-hidden rows live in the SEPARATE `filter` field below, not
    /// merged in here: Excel's two SUBTOTAL layers need the manual/filter
    /// distinction (1-11 exclude filter-hidden rows only, 101-111 exclude
    /// both), and a merged set could not express that rule.
    hidden_rows: BTreeSet<u32>,
    /// The sheet's AutoFilter — committed RULES plus the row set they
    /// DERIVED (E3 of `design-engine-hidden-rows.md`). `None` means no
    /// filter is active, which is the same observable state as an empty
    /// rule list: nothing hidden.
    ///
    /// Beside `hidden_rows` for the same reason `hidden_rows` is beside
    /// `row_heights`, and it inherits the same three freebies: structural
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
    filter: Option<crate::filter::SheetAutoFilter>,
    /// How many predicate scans this sheet has run. `Cell` because the scan
    /// itself runs behind `&self` (it must, so it can read cell values
    /// through the eager provider while `apply_filter` holds `&mut self`).
    ///
    /// Exists purely so tests can assert the negative that matters: that a
    /// cell write, a structural edit, or a hidden-row epoch bump does NOT
    /// re-run the predicate. "The count did not move" is the only direct
    /// evidence that visibility is a snapshot and not a derivation.
    filter_scan_count: Cell<u64>,
    /// Cumulative count of completed formula-inner evaluations. Read-only
    /// debug counter used by the Phase 1 scale tests to assert laziness —
    /// `bulk_load` of N formulas
    /// must keep this at 0 until the first `get_cell`. `Cell` so the counter
    /// can be bumped from `&self` (eval runs through the immutable reader).
    formula_eval_count: Rc<Cell<usize>>,
    /// Cumulative count of formulas inserted via `BulkLoader::set_formula`.
    /// Bumped once per successful entry inside `bulk_load`; the plain
    /// `Sheet::set_formula` path does NOT bump this. Used by the scale
    /// suite to verify "imported" vs "live-edited" formula provenance.
    imported_formula_count: Cell<usize>,
    /// Cumulative number of formula-inner addresses discovered through Store
    /// reverse dependencies while mutation code prepares spill/subscriber
    /// maintenance. This remains a complexity probe; it is not a dirty graph.
    reverse_dep_visit_count: Cell<u64>,

    /// Monotonic generation of same-sheet formula AST/source topology. A
    /// formula-content mutation bumps this value, invalidating every embedded
    /// static-cycle certificate in O(1). Hydration itself preserves topology
    /// and therefore transfers the current certificate without a bump.
    formula_topology_epoch: Cell<u64>,
    /// Deterministic complexity probe: number of formula ASTs expanded by the
    /// install-time static cycle analyzer. It excludes Store evaluation.
    static_cycle_node_visit_count: Cell<u64>,

    /// AUDIT B-5 — counts `has_address_subscribers` probes performed by
    /// `BulkLoader::flush`'s notify tail (one per entry of
    /// touched ∪ dirty). With zero address subscriptions the tail
    /// early-outs and this stays untouched — pinned by the scale suite
    /// so a 1M-cell restore never pays millions of hash probes to
    /// conclude nobody is watching.
    bulk_notify_probe_count: Cell<u64>,

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
    spill_targets: HashMap<AtomId, Vec<CellAddress>>,
    /// AUDIT A-8 — reverse spill index: target address →
    /// `(anchor_atom, anchor_address)`. Maintained in lockstep with
    /// `spill_targets` (`register_spill` inserts, `clear_spill` removes,
    /// `bulk_install_storage` teardown clears) so the per-write spill
    /// guards (`spilled_into_anchor`, `is_target_occupied`) are O(1) map
    /// probes instead of a scan over every target list plus a reverse
    /// scan of `cells` — one `=SEQUENCE(100000)` must not make every
    /// keystroke O(100k).
    spill_target_anchor: HashMap<CellAddress, (AtomId, CellAddress)>,
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
    spill_blocked: spill_claims::BlockedClaims,
}



/// Shared facade/formula-inner context: the minimal handles needed to mint and
/// resolve per-address Store atoms without holding `&Sheet`.
///
/// Every field is an owned `Store` clone or `Rc` clone, so a `FacadeCtx` is
/// cheap to `clone()` and satisfies the `'static` bound required to move it
/// into a store `read_fn` closure. That is the unblock for the formula-inner
/// path: the inner read closure captures a `FacadeCtx` clone and calls
/// [`FacadeCtx::get_or_create_facade`] to reactively resolve any OTHER cell a
/// formula references, under a bare `&self` sheet method.
///
/// It maintains `atoms_owned` through the same [`FacadeCtx::owned_create_atom`]
/// / [`FacadeCtx::owned_create_derived_ctx`] doors the sheet uses, so the
/// per-sheet atom count stays exact regardless of which path minted the atom.
#[derive(Clone)]
pub(crate) struct FacadeCtx {
    store: Store,
    atoms_owned: Rc<Cell<usize>>,
    interior: Rc<SheetInterior>,
    slot_epoch_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    cell_facade_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4c: shared per-address formula-inner atom family — see the field of
    /// the same name on [`Sheet`]. The facade for a formula address delegates
    /// to `formula_inner_of(addr)`.
    formula_inner_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P5 Tier-B geometry atom families — see [`Sheet`].
    range_band_epoch_family: Rc<RefCell<AtomFamily<RangeBandKey>>>,
    range_column_epoch_family: Rc<RefCell<AtomFamily<RangeColumnKey>>>,
    range_sheet_epoch_family: Rc<RefCell<AtomFamily<()>>>,
    /// P4c: shared mid-evaluation address set for the runtime cycle guard
    /// (codex F1) — see the field of the same name on [`Sheet`].
    in_flight: Rc<RefCell<HashSet<CellAddress>>>,
    workbook_context: Rc<RefCell<Option<Weak<WorkbookAtomContext>>>>,
    workbook_sheet_index: Rc<Cell<Option<usize>>>,
    formula_eval_count: Rc<Cell<usize>>,
}













pub(crate) struct WorkbookAtomContext {
    store: Store,
    topology: RefCell<WorkbookAtomTopology>,
    topology_epoch: RefCell<Option<AtomId>>,
    topology_revision: Cell<u64>,
    names: RefCell<HashMap<String, Value>>,
    names_epoch: RefCell<Option<AtomId>>,
    names_revision: Cell<u64>,
    /// Structured-reference Table projection, keyed by uppercased name
    /// (design doc #32 §5.3). Reactive geometry/name-change invalidation is
    /// carried by the `tables_epoch` atom below.
    tables: RefCell<HashMap<String, ProjectedTable>>,
    /// Reactive invalidation seam for Table geometry / name changes (design
    /// doc #32 §8). A structured-reference formula's `lookup_table` does a
    /// tracked read of this epoch atom (`depend_tables`); every Table
    /// registry mutation `store.set(+1)`s it (`bump_tables_epoch`), so only
    /// the formulas that actually resolved a Table re-derive — cell-CONTENT
    /// edges are already carried by the resolved range's facade reads.
    ///
    /// One shared atom (not per-sheet): every sheet in a workbook shares one
    /// Store (`Workbook::store`), so this single edge invalidates cross-sheet
    /// structured references for free — exactly as `topology_epoch` /
    /// `names_epoch` already do. (Design §8 sketched a per-sheet atom + O(n)
    /// broadcast under a stale "one Store per sheet" model; the shared-Store
    /// reality makes a single atom both simpler and sufficient.)
    tables_epoch: RefCell<Option<AtomId>>,
    tables_revision: Cell<u64>,
    /// Host-pushed per-sheet MANUALLY-hidden row sets consumed by SUBTOTAL
    /// 101-111 (design doc #32 §6, CANONICAL_OWNERSHIP §7-1). Keyed by 0-based
    /// sheet index; the value is shared (`Rc`) so a resolver hands the set back
    /// to the evaluator without cloning the rows. This is pure read-only
    /// evaluation input — the engine never models hidden state and never
    /// infers a row's hidden source; the host decides which of the two side
    /// stores a row lands in. Empty pushes drop the entry, so a lookup miss
    /// and an empty set are the same "no filtering" signal.
    ///
    /// Placed here (not on `Sheet`) for the same reason as `tables`: every
    /// sheet shares one `Store`, and a cross-sheet SUBTOTAL must reach ANY
    /// sheet's set from within one provider. The design §6.2 sketch of a
    /// per-`Sheet` field + per-sheet epoch predates the shared-Store reality
    /// (same as the `tables_epoch` note above).
    eval_hidden_rows: RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    /// Host-pushed per-sheet FILTER-hidden row sets (`design-filter-hidden-rows`
    /// §6.2). Structurally identical to `eval_hidden_rows` above — same keying,
    /// same `Rc` sharing, same whole-set-replace / empty-clears contract — but
    /// kept as an INDEPENDENT store because Excel's two SUBTOTAL layers need
    /// the source distinction: 1-11 exclude filter-hidden rows only, 101-111
    /// exclude both. A merged set could not express that rule.
    eval_filter_hidden_rows: RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    /// Reactive invalidation seam for MANUAL hidden-row pushes (design doc #32
    /// §6.2). A SUBTOTAL 101-111 formula's `hidden_rows` resolve does a tracked
    /// read of this epoch (`depend_manual_hidden`); `set_eval_hidden_rows`
    /// `store.set(+1)`s it so ONLY the formulas that consumed a manual hidden
    /// set re-derive. 1-11 never touch this path, hold no edge, and stay
    /// undisturbed by a manual hide/unhide. One shared atom (per the
    /// shared-Store reality) — cross-sheet over-invalidation is a documented
    /// coarseness, identical to `tables_epoch`'s single-atom choice; results
    /// stay correct because the side storage is per-sheet keyed.
    manual_hidden_epoch: RefCell<Option<AtomId>>,
    manual_hidden_revision: Cell<u64>,
    /// Reactive invalidation seam for FILTER hidden-row pushes
    /// (`design-filter-hidden-rows` §6.4). Deliberately a SEPARATE atom from
    /// `manual_hidden_epoch`: under the new two-layer rule BOTH 1-11 and
    /// 101-111 read the filter set, so sharing one epoch would make every
    /// manual hide/unhide dirty every 1-11 SUBTOTAL in the workbook — a pure
    /// new re-computation cost. With the split, 1-11 hold only the filter edge.
    filter_hidden_epoch: RefCell<Option<AtomId>>,
    filter_hidden_revision: Cell<u64>,
    custom_functions: RefCell<Option<Arc<dyn CustomFunctionRegistry>>>,
    custom_epoch: RefCell<Option<AtomId>>,
    custom_revision: Cell<u64>,
    custom_call_depth: Rc<Cell<usize>>,
    in_flight: Rc<RefCell<HashSet<(usize, CellAddress)>>>,
    async_custom: RefCell<AsyncCustomState>,
}

impl WorkbookAtomContext {
    pub(crate) fn new(store: Store, custom_call_depth: Rc<Cell<usize>>) -> Rc<Self> {
        Rc::new(Self {
            store,
            topology: RefCell::new(WorkbookAtomTopology {
                sheets: Vec::new(),
                by_name: HashMap::new(),
            }),
            topology_epoch: RefCell::new(None),
            topology_revision: Cell::new(0),
            names: RefCell::new(HashMap::new()),
            names_epoch: RefCell::new(None),
            names_revision: Cell::new(0),
            tables: RefCell::new(HashMap::new()),
            tables_epoch: RefCell::new(None),
            tables_revision: Cell::new(0),
            eval_hidden_rows: RefCell::new(HashMap::new()),
            eval_filter_hidden_rows: RefCell::new(HashMap::new()),
            manual_hidden_epoch: RefCell::new(None),
            manual_hidden_revision: Cell::new(0),
            filter_hidden_epoch: RefCell::new(None),
            filter_hidden_revision: Cell::new(0),
            custom_functions: RefCell::new(None),
            custom_epoch: RefCell::new(None),
            custom_revision: Cell::new(0),
            custom_call_depth,
            in_flight: Rc::new(RefCell::new(HashSet::new())),
            async_custom: RefCell::new(AsyncCustomState {
                entries: HashMap::new(),
                by_call_id: HashMap::new(),
                pending: Vec::new(),
                next_call_id: 1,
                generation: 0,
            }),
        })
    }

    fn epoch_atom(&self, slot: &RefCell<Option<AtomId>>, revision: u64) -> AtomId {
        if let Some(id) = *slot.borrow() {
            return id;
        }
        let id = self.store.create_atom(Value::Number(revision as f64));
        *slot.borrow_mut() = Some(id);
        id
    }

    fn depend_topology(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.topology_epoch, self.topology_revision.get());
        let _ = args.get(id);
    }

    fn depend_names(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.names_epoch, self.names_revision.get());
        let _ = args.get(id);
    }

    fn depend_custom(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.custom_epoch, self.custom_revision.get());
        let _ = args.get(id);
    }

    /// Tracked read of the Table-invalidation epoch (design doc #32 §8).
    /// Consulted by both `lookup_table_*` paths — including their MISS
    /// branches — so a formula that references a not-yet-defined Table
    /// re-derives once that Table is created.
    fn depend_tables(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.tables_epoch, self.tables_revision.get());
        let _ = args.get(id);
    }

    /// Publish a Table geometry / name change so every structured-reference
    /// formula holding a `depend_tables` edge re-derives (design doc #32 §8).
    /// Driven by `Workbook::bump_tables_epoch` after each registry mutation.
    pub(crate) fn bump_tables_epoch(&self) {
        self.bump_epoch(&self.tables_epoch, &self.tables_revision);
    }

    /// Tracked read of the MANUAL hidden-row invalidation epoch (design doc #32
    /// §6.2). Consulted by `hidden_rows_for_sheet` — including its miss
    /// branch — so a SUBTOTAL 101-111 formula that currently sees NO hidden
    /// rows still re-derives once the host pushes a set (mirrors
    /// `depend_tables`'s pre-probe placement).
    fn depend_manual_hidden(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.manual_hidden_epoch, self.manual_hidden_revision.get());
        let _ = args.get(id);
    }

    /// Tracked read of the FILTER hidden-row invalidation epoch
    /// (`design-filter-hidden-rows` §6.4). Same pre-probe placement as
    /// `depend_manual_hidden`, but on its own atom so a manual hide/unhide
    /// never dirties the 1-11 formulas that only hold this edge.
    fn depend_filter_hidden(&self, args: &ReadArgs) {
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
    fn remap_hidden_rows(&self, remap: impl Fn(usize) -> Option<usize>) {
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

    fn bump_epoch(&self, slot: &RefCell<Option<AtomId>>, revision: &Cell<u64>) {
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
    fn lookup_table_named(&self, name: &str, args: &ReadArgs) -> Option<ResolvedTable> {
        // Register the geometry/name epoch edge BEFORE the registry probe so
        // even a miss (`#NAME?`) re-derives once the Table is later created.
        self.depend_tables(args);
        let table = self.tables.borrow().get(&name.to_ascii_uppercase()).cloned()?;
        // Tracked topology read: cross-sheet resolution depends on the
        // sheet-name → index map, so re-derive if a sheet is added/removed.
        self.depend_topology(args);
        let sheet_index = self.topology.borrow().by_name.get(&table.sheet_name).copied()?;
        Some(table.to_resolved(sheet_index))
    }

    /// Resolve a table-less structured reference (`[Col]` / `[@Col]`): the
    /// Table on `sheet_index` whose range contains `addr`. `None` when the
    /// cell is inside no Table.
    fn lookup_table_containing(
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
    fn sweep_async_custom_entries(&self) {
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

    fn resolve_sheet(&self, name: &str, args: &ReadArgs) -> Option<(usize, FacadeCtx)> {
        self.depend_topology(args);
        let topology = self.topology.borrow();
        let idx = topology.by_name.get(name).copied()?;
        Some((idx, topology.sheets.get(idx)?.1.clone()))
    }

    fn sheet_count(&self, args: &ReadArgs) -> usize {
        self.depend_topology(args);
        self.topology.borrow().sheets.len()
    }

    fn lookup_named(&self, name: &str, args: &ReadArgs) -> Option<Value> {
        self.depend_names(args);
        self.names.borrow().get(&name.to_ascii_uppercase()).cloned()
    }

    fn call_custom(&self, name: &str, values: &[Value], args: &ReadArgs) -> Option<Value> {
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

    /// Async dispatch: memoized per (name, args). Returns the per-call
    /// result atom's current value (settled result or `#BUSY!`) and makes
    /// the calling formula depend on that atom, so the settle write — or a
    /// registry-invalidation reset — re-derives exactly the observers.
    fn async_custom_result(&self, name: &str, values: &[Value], args: &ReadArgs) -> Value {
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

impl FacadeCtx {
    fn workbook_scope(&self) -> Option<(Rc<WorkbookAtomContext>, usize)> {
        let context = self
            .workbook_context
            .borrow()
            .as_ref()
            .and_then(Weak::upgrade)?;
        Some((context, self.workbook_sheet_index.get()?))
    }

    fn is_in_flight(&self, addr: CellAddress) -> bool {
        if let Some((context, sheet_idx)) = self.workbook_scope() {
            return context.in_flight.borrow().contains(&(sheet_idx, addr));
        }
        self.in_flight.borrow().contains(&addr)
    }

    /// `owned_create_atom` mirror — keeps `atoms_owned` exact from within a
    /// `'static` closure that has no `&Sheet`.
    fn owned_create_atom(&self, value: Value) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_atom(value)
    }

    /// `owned_create_derived_ctx` mirror (lazy — computes nothing until first
    /// read, INV-7).
    fn owned_create_derived_ctx(&self, read_fn: impl Fn(&ReadArgs) -> Value + 'static) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_derived_ctx(read_fn)
    }

    /// The lazy slot-epoch primitive for an address (one per address). Bumped
    /// whenever the inner atom identity changes so the facade re-derives off a
    /// swap. Created on demand.
    fn epoch_of(&self, addr: CellAddress) -> AtomId {
        self.slot_epoch_family
            .borrow_mut()
            .get_or_create(addr, || self.owned_create_atom(Value::Null))
    }

    /// Idempotent per-address facade derived atom — see [`Sheet::facade_of`]
    /// for the contract. Returns the cached facade if one exists, else lazily
    /// creates the slot-epoch primitive and the facade derived atom.
    ///
    /// BORROW RULE (D7): every family guard and the `interior.cells` borrow
    /// inside the read closure is released (inner id copied / plain value
    /// cloned) before any `store.*` call. The read closure captures only owned
    /// values / `Rc` clones — never `&self` — so it satisfies the `'static`
    /// bound and can resolve the inner atom on demand.
    fn get_or_create_facade(&self, addr: CellAddress) -> AtomId {
        enum InnerSlot {
            Atom(AtomId),
            Plain(Value),
            Absent,
        }
        // Fast path: already built. Bind so the `borrow()` guard drops here.
        let existing = self.cell_facade_family.borrow().get(&addr);
        if let Some(id) = existing {
            return id;
        }
        let epoch_id = self.epoch_of(addr);
        // Facade derived atom. Capture by value / `Rc` clone so the closure
        // resolves the current inner atom without borrowing the sheet.
        let interior = Rc::clone(&self.interior);
        let store = self.store.clone();
        let ctx = self.clone();
        self.cell_facade_family
            .borrow_mut()
            .get_or_create(addr, || {
                self.owned_create_derived_ctx(move |args| {
                    // Tracked: an epoch bump (inner-atom identity change) re-runs us.
                    let _ = args.get(epoch_id);
                    // Every formula delegates to its formula-inner atom. Workbook
                    // scope, when present, is consumed by that atom's provider;
                    // there is no eager/cached cross-sheet side path.
                    if ctx.formula_expr_for(addr).is_some() {
                        let inner = ctx.formula_inner_of(addr);
                        let formula_value = args.get(inner);

                        // Array formulas mirror their current spill outcome in
                        // the anchor atom. Depend on that Store atom as a
                        // structural projection: it holds either the installed
                        // Array or #SPILL!, while the formula-inner above
                        // remains the formula value/dependency authority.
                        let spill_anchor = {
                            let cells = interior.cells.borrow();
                            match cells.get(&addr) {
                                Some(CellSlot::Atom(id)) => Some(*id),
                                Some(CellSlot::Plain(_)) | None => None,
                            }
                        };
                        return match spill_anchor {
                            Some(id) if store.has_atom(id) => args.get(id),
                            _ => formula_value,
                        };
                    }
                    // Snapshot the current inner under a short borrow, then release.
                    let inner = {
                        let cells = interior.cells.borrow();
                        match cells.get(&addr) {
                            Some(CellSlot::Atom(id)) => InnerSlot::Atom(*id),
                            Some(CellSlot::Plain(v)) => InnerSlot::Plain(v.clone()),
                            None => InnerSlot::Absent,
                        }
                    };
                    match inner {
                        // Guard the defensive "atom destroyed under the slot" case
                        // (mirrors `cell_value_at`): `args.get` panics on a missing
                        // dep atom, so probe existence first.
                        InnerSlot::Atom(id) if store.has_atom(id) => args.get(id),
                        InnerSlot::Atom(_) => Value::Null,
                        InnerSlot::Plain(v) => v,
                        InnerSlot::Absent => Value::Null,
                    }
                })
            })
    }

    /// Resolve `addr`'s formula AST without a `&Sheet`. Prefers the hydrated
    /// `formula_exprs` entry; falls back to parsing `formula_source` on
    /// demand, because `hydrate_formula` DRAINS `formula_source` into
    /// `formula_exprs` — so a hydrated formula lives only in the former and an
    /// unhydrated one only in the latter (codex F2). A parse failure maps to
    /// the same `Expr::Error(InvalidValue)` sentinel the eager hydrator
    /// installs, so a malformed formula reads as `#VALUE!` rather than trapping
    /// the reader.
    fn formula_expr_for(&self, addr: CellAddress) -> Option<Rc<Expr>> {
        if let Some(expr) = self.interior.formula_exprs.borrow().get(&addr) {
            return Some(Rc::clone(expr));
        }
        let source = self.interior.formula_source.borrow().get(&addr).cloned()?;
        let expr =
            parse_formula(source.source.as_ref()).unwrap_or(Expr::Error(ValueError::InvalidValue));
        Some(Rc::new(expr))
    }

    /// The per-address formula-inner derived atom (lazy, one per formula
    /// address). Its read closure re-evaluates the formula under an on-stack
    /// [`AtomFormulaProvider`], re-recording its dependency edges on every run
    /// (vanilla `dependenciesChange` parity). It depends only on the cells the
    /// formula actually reads — no address→formula index.
    fn formula_inner_of(&self, addr: CellAddress) -> AtomId {
        let existing = self.formula_inner_family.borrow().get(&addr);
        if let Some(id) = existing {
            return id;
        }
        let ctx = self.clone();
        self.formula_inner_family
            .borrow_mut()
            .get_or_create(addr, move || {
                let ctx_read = ctx.clone();
                ctx.owned_create_derived_ctx(move |args| ctx_read.eval_formula_inner(addr, args))
            })
    }

    fn range_band_epoch_of(&self, key: RangeBandKey) -> AtomId {
        self.range_band_epoch_family
            .borrow_mut()
            .get_or_create(key, || self.owned_create_atom(Value::Null))
    }

    fn range_column_epoch_of(&self, key: RangeColumnKey) -> AtomId {
        self.range_column_epoch_family
            .borrow_mut()
            .get_or_create(key, || self.owned_create_atom(Value::Null))
    }

    fn range_sheet_epoch(&self) -> AtomId {
        self.range_sheet_epoch_family
            .borrow_mut()
            .get_or_create((), || self.owned_create_atom(Value::Null))
    }

    fn depend_range_geometry_epochs(&self, range: CellRange, args: &ReadArgs) {
        let range = range.normalize();
        if range_cell_count_u64(range) <= RANGE_TIER_A_CELL_LIMIT {
            return;
        }

        let bounds = range_geometry_bounds(range);

        if range_band_count_u64(range) <= RANGE_BAND_DEP_LIMIT {
            let start_band = range_row_band(bounds.start_row);
            let end_band = range_row_band(bounds.end_row);
            for col in bounds.start_col..=bounds.end_col {
                for row_band in start_band..=end_band {
                    args.depend(self.range_band_epoch_of(RangeBandKey { col, row_band }));
                }
            }
            return;
        }

        let cols = inclusive_span_u64(bounds.start_col, bounds.end_col);
        if cols <= RANGE_COLUMN_DEP_LIMIT {
            for col in bounds.start_col..=bounds.end_col {
                args.depend(self.range_column_epoch_of(RangeColumnKey { col }));
            }
            return;
        }

        args.depend(self.range_sheet_epoch());
    }

    /// Formula-inner read body: evaluate `addr`'s formula under an on-stack
    /// [`AtomFormulaProvider`] whose ref/range lookups resolve through the
    /// facade family, so every cell the formula reads becomes a store
    /// dependency edge on THIS inner atom. The runtime cycle guard (codex F1)
    /// is armed by pushing `addr` onto the shared `in_flight` set via
    /// [`InFlightGuard`] for the duration of the eval.
    fn eval_formula_inner(&self, addr: CellAddress, args: &ReadArgs) -> Value {
        let expr = match self.formula_expr_for(addr) {
            Some(expr) => expr,
            // No AST resolvable (address is no longer a formula) — behave like
            // an empty cell rather than trapping the reader.
            None => return Value::Null,
        };
        let _guard = InFlightGuard::enter(self, addr);
        let provider = AtomFormulaProvider {
            args,
            ctx: self.clone(),
            current_cell: Cell::new(Some(addr)),
        };
        let value = normalize_formula_cell_result(eval_expr_with_provider(&expr, &provider));
        self.formula_eval_count
            .set(self.formula_eval_count.get() + 1);
        value
    }

    /// Row-major snapshot of the addresses inside `range` carrying a primitive
    /// or formula value — the `&Sheet`-free twin of
    /// [`Sheet::for_each_sparse_cell_with`]'s address collection. All `interior`
    /// borrows drop before returning, so the caller can read facades
    /// reactively without holding a borrow across a `store` read (D7).
    /// Tier-A ranges track every member facade; larger ranges track geometry
    /// epochs and use this sparse snapshot only for current values.
    ///
    /// # 「Row-major」指的是坐标，不是存储分桶
    ///
    /// 字面量格与公式格住在两张分开的稀疏表里，两张表各自升序 —— 但「先发完
    /// 字面量、再发公式」拼出来的序列不是行主序，混了两类格子的区域会把公式格
    /// 甩到最后（`=SEQUENCE(3)` 铺出的 A1:A3 发成 A2、A3、A1）。区域的遍历顺序
    /// 是**几何事实**，所以这里把两条升序序列按坐标**归并**，而不是给 spill
    /// 锚点开特例把它挪到前面。
    /// 见 `excel/rust/excel-core/tests/range_materialization_order.rs`。
    fn range_member_addrs(&self, range: CellRange) -> Vec<CellAddress> {
        let primitive_addrs: Vec<CellAddress> = {
            let cells = self.interior.cells.borrow();
            cells
                .range_iter(range)
                .map(|(addr, _)| addr)
                .filter(|addr| {
                    !self.interior.formula_cells.borrow().contains_key(addr)
                        && !self.interior.formula_source.borrow().contains_key(addr)
                })
                .collect()
        };
        // `primitive_slot_has_visible_value` 会读 store，必须在 `cells` 借用
        // 释放之后再滤。滤完仍是升序。
        let primitives: Vec<CellAddress> = primitive_addrs
            .into_iter()
            .filter(|addr| self.primitive_slot_has_visible_value(*addr))
            .collect();
        merge_row_major(primitives, formula_addrs_in_range(&self.interior, range))
    }

    /// Primitive Null atoms may remain alive as Store dependency anchors after
    /// a clear. They are internal state, not sparse worksheet members.
    fn primitive_slot_has_visible_value(&self, addr: CellAddress) -> bool {
        let probe: Result<Value, AtomId> = {
            let cells = self.interior.cells.borrow();
            match cells.get(&addr) {
                Some(CellSlot::Plain(value)) => Ok(value.clone()),
                Some(CellSlot::Atom(id)) => Err(*id),
                None => return false,
            }
        };
        let value = match probe {
            Ok(value) => value,
            Err(id) if self.store.has_atom(id) => self.store.get(id),
            Err(_) => Value::Null,
        };
        !matches!(value, Value::Null)
    }
}





/// On-stack [`EvalProvider`] for a formula-inner read_fn (P4c). Every cell /
/// range lookup resolves through the facade family and is issued as a tracked
/// `ReadArgs::get`, so the enclosing formula-inner atom's dependency edges are
/// exactly the cells the formula reads — the store's `dependenciesMap` is the
/// single response graph (INV-2), no address→formula index. Mirrors
/// [`SheetEvalProvider`]'s method bodies, but reads go through `read_facade`
/// instead of `Sheet::peek_value_with_provider`.
///
/// Lifetimes: `'a` is the borrow of the live [`ReadArgs`] handed to the
/// read_fn; `'r` is that `ReadArgs`'s own store-inner borrow.
struct AtomFormulaProvider<'a, 'r> {
    args: &'a ReadArgs<'r>,
    ctx: FacadeCtx,
    /// Cell currently being evaluated (for no-arg `ROW()` / `COLUMN()`), seeded
    /// to the formula's own address and moved by `set_current_cell` under the
    /// eval's save/restore guard.
    current_cell: Cell<Option<CellAddress>>,
}

impl<'a, 'r> AtomFormulaProvider<'a, 'r> {
    /// Read a referenced cell through its facade as a tracked store dependency,
    /// arming the runtime cycle guard (codex F1): if `addr` is already
    /// mid-evaluation (present in the shared `in_flight` set), reading its
    /// facade would trip the store's computing-panic, so instead record the
    /// re-invalidating edge without reading (`ReadArgs::depend`) and surface a
    /// sticky `#CYCLE!`. A later edit that breaks the cycle bumps the depended
    /// atom's generation and re-derives this reader (see the `depend` primitive
    /// tests).
    fn read_facade_from(&self, ctx: &FacadeCtx, addr: CellAddress) -> Value {
        let facade = ctx.get_or_create_facade(addr);
        if ctx.is_in_flight(addr) {
            self.args.depend(facade);
            return Value::Error(ValueError::CyclicRef);
        }
        self.args.get(facade)
    }

    fn read_facade(&self, addr: CellAddress) -> Value {
        self.read_facade_from(&self.ctx, addr)
    }

    fn workbook_context(&self) -> Option<Rc<WorkbookAtomContext>> {
        self.ctx.workbook_scope().map(|(context, _)| context)
    }

    fn resolve_sheet(&self, name: &str) -> Option<(usize, FacadeCtx)> {
        self.workbook_context()?.resolve_sheet(name, self.args)
    }

    fn for_each_range_in(
        &self,
        ctx: &FacadeCtx,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        ctx.depend_range_geometry_epochs(range, self.args);
        let member_addrs = ctx.range_member_addrs(range);
        if range_cell_count_u64(range) <= RANGE_TIER_A_CELL_LIMIT {
            let members: HashSet<CellAddress> = member_addrs.iter().copied().collect();
            for addr in range.normalize().iter() {
                if !members.contains(&addr) {
                    let _ = self.read_facade_from(ctx, addr);
                }
            }
        }
        for addr in member_addrs {
            let value = collapse_array_for_eval(self.read_facade_from(ctx, addr));
            f(addr, value);
        }
    }

    fn formula_text_in(ctx: &FacadeCtx, addr: CellAddress) -> Option<String> {
        if let Some(text) = ctx.interior.formula_texts.borrow().get(&addr) {
            return Some(text.clone());
        }
        ctx.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|source| source.source.as_ref().to_string())
    }
}

impl<'a, 'r> EvalProvider for AtomFormulaProvider<'a, 'r> {
    fn cell(&self, addr: CellAddress) -> Value {
        collapse_array_for_eval(self.read_facade(addr))
    }

    fn sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return Value::Error(ValueError::InvalidRef);
        };
        collapse_array_for_eval(self.read_facade_from(&ctx, addr))
    }

    fn raw_cell(&self, addr: CellAddress) -> Value {
        self.read_facade(addr)
    }

    fn raw_sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return Value::Error(ValueError::InvalidRef);
        };
        self.read_facade_from(&ctx, addr)
    }

    /// Store-shaped range read: Tier A per-member facades for small ranges and
    /// Tier B geometry epoch atoms for larger ranges. The evaluator callback
    /// remains sparse: empty cells are only read for dependency edges and are
    /// not emitted.
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        self.for_each_range_in(&self.ctx, range, f);
    }

    fn for_each_sheet_range_cell(
        &self,
        sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            f(
                range.normalize().start,
                Value::Error(ValueError::InvalidRef),
            );
            return;
        };
        self.for_each_range_in(&ctx, range, f);
    }

    fn current_cell(&self) -> Option<CellAddress> {
        self.current_cell.get()
    }

    fn set_current_cell(&self, addr: Option<CellAddress>) {
        self.current_cell.set(addr);
    }

    fn col_width(&self, col: u32) -> Option<u32> {
        // UNTRACKED read of the shared interior's sparse width map for
        // `CELL("width")` (D7: borrow → copy → release; no store call between,
        // no dependency edge armed). This is the formula's OWN sheet — a
        // cross-sheet `CELL("width", Other!A1)` collapses to this sheet's
        // widths, the same limitation the content-touching info_types carry.
        self.ctx.interior.col_widths.borrow().get(&col).copied()
    }

    fn cell_has_formula(&self, addr: CellAddress) -> bool {
        self.ctx.interior.formula_cells.borrow().contains_key(&addr)
            || self.ctx.interior.needs_parse.borrow().contains(&addr)
    }

    fn sheet_cell_has_formula(&self, sheet: &str, addr: CellAddress) -> bool {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return false;
        };
        ctx.interior.formula_cells.borrow().contains_key(&addr)
            || ctx.interior.needs_parse.borrow().contains(&addr)
    }

    fn lookup_named(&self, name: &str) -> Option<Value> {
        self.workbook_context()?.lookup_named(name, self.args)
    }

    fn lookup_table(&self, name: Option<&str>) -> Option<ResolvedTable> {
        let context = self.workbook_context()?;
        match name {
            Some(n) => context.lookup_table_named(n, self.args),
            None => {
                // Table-less `[Col]` / `[@Col]`: locate the Table that
                // contains the currently-evaluating cell on its own sheet.
                let addr = self.current_cell()?;
                let (_, sheet_idx) = self.ctx.workbook_scope()?;
                context.lookup_table_containing(sheet_idx, addr, self.args)
            }
        }
    }

    fn current_sheet_index(&self) -> Option<usize> {
        let (context, sheet_idx) = self.ctx.workbook_scope()?;
        context.depend_topology(self.args);
        Some(sheet_idx)
    }

    fn hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Live formula-inner path: the tracked read of `manual_hidden_epoch`
        // inside `hidden_rows_for_sheet` is what makes a `set_eval_hidden_rows`
        // push precisely re-derive this SUBTOTAL 101-111 formula (design §6.2).
        self.workbook_context()?
            .hidden_rows_for_sheet(sheet_index, self.args)
    }

    fn filter_hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Twin of `hidden_rows` on the independent `filter_hidden_epoch`; read
        // by both SUBTOTAL layers (`design-filter-hidden-rows` §6.3).
        self.workbook_context()?
            .filter_hidden_rows_for_sheet(sheet_index, self.args)
    }

    fn sheet_index_of(&self, name: &str) -> Option<usize> {
        self.resolve_sheet(name).map(|(idx, _)| idx)
    }

    fn sheet_count(&self) -> usize {
        self.workbook_context()
            .map(|context| context.sheet_count(self.args))
            .unwrap_or(1)
    }

    fn cell_formula_text(&self, addr: CellAddress) -> Option<String> {
        Self::formula_text_in(&self.ctx, addr)
    }

    fn sheet_cell_formula_text(&self, sheet: &str, addr: CellAddress) -> Option<String> {
        let (_, ctx) = self.resolve_sheet(sheet)?;
        Self::formula_text_in(&ctx, addr)
    }

    fn call_custom(&self, name: &str, values: &[Value]) -> Option<Value> {
        self.workbook_context()?
            .call_custom(name, values, self.args)
    }
}

impl Sheet {
    pub fn new() -> Self {
        Self::with_store(Store::new())
    }

    /// Construct a sheet bound to a SHARED store (P3 of the atom-delegation
    /// rewrite): `Workbook` hands every sheet a clone of its single store so
    /// cross-sheet dependencies are ordinary in-store edges (P6).
    /// `Store` is a cheap Rc handle — cloning shares state, exactly like
    /// passing the vanilla store object around. Standalone sheets
    /// (`Sheet::new`) keep a private store.
    pub fn with_store(store: Store) -> Self {
        Sheet {
            store,
            atoms_owned: Rc::new(Cell::new(0)),
            interior: Rc::new(SheetInterior {
                cells: RefCell::new(RowMajorMap::new()),
                formula_cells: RefCell::new(RowMajorMap::new()),
                formula_exprs: RefCell::new(HashMap::new()),
                formula_texts: RefCell::new(HashMap::new()),
                formula_source: RefCell::new(RowMajorMap::new()),
                needs_parse: RefCell::new(HashSet::new()),
                col_widths: RefCell::new(BTreeMap::new()),
            }),
            slot_epoch_family: Rc::new(RefCell::new(AtomFamily::new())),
            cell_facade_family: Rc::new(RefCell::new(AtomFamily::new())),
            formula_inner_family: Rc::new(RefCell::new(AtomFamily::new())),
            range_band_epoch_family: Rc::new(RefCell::new(AtomFamily::new())),
            range_column_epoch_family: Rc::new(RefCell::new(AtomFamily::new())),
            range_sheet_epoch_family: Rc::new(RefCell::new(AtomFamily::new())),
            in_flight: Rc::new(RefCell::new(HashSet::new())),
            workbook_context: Rc::new(RefCell::new(None)),
            workbook_sheet_index: Rc::new(Cell::new(None)),
            cell_subscriptions: HashMap::new(),
            next_cell_sub_id: 0,
            formats: HashMap::new(),
            range_formats: Vec::new(),
            conditional_rules: Vec::new(),
            row_heights: BTreeMap::new(),
            hidden_rows: BTreeSet::new(),
            filter: None,
            filter_scan_count: Cell::new(0),
            formula_eval_count: Rc::new(Cell::new(0)),
            imported_formula_count: Cell::new(0),
            reverse_dep_visit_count: Cell::new(0),
            formula_topology_epoch: Cell::new(1),
            static_cycle_node_visit_count: Cell::new(0),
            spill_targets: HashMap::new(),
            spill_target_anchor: HashMap::new(),
            spill_anchor_addr: HashMap::new(),
            spill_blocked: Default::default(),
            bulk_notify_probe_count: Cell::new(0),
        }
    }

    pub(crate) fn attach_workbook_context(
        &self,
        context: &Rc<WorkbookAtomContext>,
        sheet_index: usize,
    ) {
        *self.workbook_context.borrow_mut() = Some(Rc::downgrade(context));
        self.workbook_sheet_index.set(Some(sheet_index));
    }

    pub(crate) fn detach_workbook_context(&self) {
        *self.workbook_context.borrow_mut() = None;
        self.workbook_sheet_index.set(None);
        let ids: Vec<AtomId> = self
            .formula_inner_family
            .borrow()
            .iter()
            .map(|(_, id)| id)
            .collect();
        for id in ids {
            if self.store.has_atom(id) {
                self.store.invalidate(id);
            }
        }
    }






















































    /// Stable facades make address remapping unnecessary; callers keep this
    /// wrapper while older mutation code is being simplified.
    fn with_remap<R>(&mut self, _addr: CellAddress, f: impl FnOnce(&mut Self) -> R) -> R {
        f(self)
    }

    fn store_batch<R>(&mut self, f: impl FnOnce(&mut Self) -> R) -> R {
        let store = self.store.clone();
        let mut result = None;
        store.batch(|_| {
            result = Some(f(self));
        });
        result.expect("store batch closure did not run")
    }



    fn formula_deps_for(expr: &Expr) -> HashSet<CellAddress> {
        let mut deps = Vec::new();
        collect_refs(expr, &mut deps);
        deps.into_iter().collect()
    }



    fn store_root_atoms_for_addr_into(&self, addr: CellAddress, out: &mut Vec<AtomId>) {
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

    fn store_root_range_geometry_atoms_for_addr_into(
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

    fn store_dependent_formula_addrs_from_atoms(
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

    fn store_dependent_formula_addrs_from_addrs<I>(&self, addrs: I) -> HashSet<CellAddress>
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

    fn store_dependent_array_formula_addrs_from_addrs<I>(&self, addrs: I) -> HashSet<CellAddress>
    where
        I: IntoIterator<Item = CellAddress>,
    {
        self.store_dependent_formula_addrs_from_addrs(addrs)
            .into_iter()
            .filter(|addr| self.formula_needs_spill_maintenance(*addr))
            .collect()
    }

    fn bump_formula_topology_epoch(&self) {
        if let Some(next) = self.formula_topology_epoch.get().checked_add(1) {
            self.formula_topology_epoch.set(next);
            return;
        }

        // Practically unreachable, but avoid accepting ancient certificates
        // after u64 wraparound.
        {
            let records = self.interior.formula_cells.borrow();
            for (_, record) in records.iter() {
                record.cycle_checked_at.set(0);
            }
        }
        {
            let sources = self.interior.formula_source.borrow();
            for (_, source) in sources.iter() {
                source.cycle_checked_at.set(0);
            }
        }
        self.formula_topology_epoch.set(1);
    }

    fn formula_cycle_is_checked(&self, addr: CellAddress, epoch: u64) -> bool {
        if let Some(record) = self.interior.formula_cells.borrow().get(&addr) {
            return record.cycle_checked_at.get() == epoch;
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .is_some_and(|source| source.cycle_checked_at.get() == epoch)
    }

    fn mark_formula_cycle_checked(&self, addr: CellAddress, epoch: u64) {
        if let Some(record) = self.interior.formula_cells.borrow().get(&addr) {
            record.cycle_checked_at.set(epoch);
            return;
        }
        if let Some(source) = self.interior.formula_source.borrow().get(&addr) {
            source.cycle_checked_at.set(epoch);
        }
    }





















    pub(crate) fn cycle_expr_for(&self, addr: CellAddress) -> Option<Rc<Expr>> {
        if let Some(expr) = self.interior.formula_exprs.borrow().get(&addr).cloned() {
            return Some(expr);
        }
        let source = self.interior.formula_source.borrow().get(&addr).cloned()?;
        parse_formula(source.source.as_ref()).map(Rc::new)
    }

    pub(crate) fn formula_addrs_in_range(&self, range: CellRange) -> HashSet<CellAddress> {
        let range = range.normalize();
        let formula_exprs = self.interior.formula_exprs.borrow();
        let formula_source = self.interior.formula_source.borrow();
        formula_exprs
            .keys()
            .copied()
            .chain(formula_source.keys())
            .filter(|addr| range.contains(*addr))
            .collect()
    }

    /// Append formula addresses referenced by `expr` for the install-time
    /// cycle walk. Ranges enqueue only formula cells, because literals cannot
    /// continue a dependency path. Large and unbounded ranges scan the sparse
    /// formula tables instead of expanding the coordinate space.
    ///
    /// This is an on-demand AST/source walk, not a retained dependency index.
    /// Store edges remain the runtime dependency truth; source inspection is
    /// required here because a never-read formula intentionally has no Store
    /// edges yet.
    fn collect_cycle_refs(
        &self,
        expr: &Expr,
        target: CellAddress,
        out: &mut Vec<CellAddress>,
        detect_unbounded_target: bool,
    ) -> bool {
        match expr {
            Expr::CellRef(addr, _) => {
                if *addr == target {
                    return true;
                }
                out.push(*addr);
            }
            Expr::Range { start, end, .. } => {
                let range = CellRange::new(*start, *end).normalize();
                let is_unbounded = range.end.row == u32::MAX || range.end.col == u32::MAX;
                if range.contains(target) && (detect_unbounded_target || !is_unbounded) {
                    return true;
                }

                let formula_exprs = self.interior.formula_exprs.borrow();
                let formula_source = self.interior.formula_source.borrow();
                let formula_count = formula_exprs.len().saturating_add(formula_source.len());
                let bounds = range_geometry_bounds(range);
                let cell_count = range_cell_count_u64(range);

                if cell_count <= formula_count as u64 {
                    for row in bounds.start_row..=bounds.end_row {
                        for col in bounds.start_col..=bounds.end_col {
                            let addr = CellAddress::new(row, col);
                            if formula_exprs.contains_key(&addr)
                                || formula_source.contains_key(&addr)
                            {
                                out.push(addr);
                            }
                        }
                    }
                } else {
                    out.extend(
                        formula_exprs
                            .keys()
                            .copied()
                            .chain(formula_source.keys())
                            .filter(|addr| range.contains(*addr)),
                    );
                }
            }
            Expr::BinOp { left, right, .. } => {
                if self.collect_cycle_refs(left, target, out, detect_unbounded_target) {
                    return true;
                }
                if self.collect_cycle_refs(right, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                if self.collect_cycle_refs(inner, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
                for arg in args {
                    if self.collect_cycle_refs(arg, target, out, detect_unbounded_target) {
                        return true;
                    }
                }
            }
            Expr::DynamicRange { start, end } => {
                if self.collect_cycle_refs(start, target, out, detect_unbounded_target) {
                    return true;
                }
                if self.collect_cycle_refs(end, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::Call(callee, args) => {
                if self.collect_cycle_refs(callee, target, out, detect_unbounded_target) {
                    return true;
                }
                for arg in args {
                    if self.collect_cycle_refs(arg, target, out, detect_unbounded_target) {
                        return true;
                    }
                }
            }
            Expr::SheetRef { .. }
            | Expr::SheetRange { .. }
            | Expr::Number(_)
            | Expr::Text(_)
            | Expr::Bool(_)
            | Expr::Error(_)
            | Expr::Name(_)
            | Expr::ArrayLit { .. }
            // 空占位实参没有地址。
            | Expr::Omitted
            // Structured reference carries no static A1 ref (design §5.2).
            | Expr::TableRef { .. } => {}
        }
        false
    }

    /// Static cycle detection (B.2). Returns true iff installing `expr` at
    /// `target` would close a same-sheet dep cycle.
    fn closes_local_cycle(&self, target: CellAddress, expr: &Expr) -> bool {
        let mut stack: Vec<CellAddress> = Vec::new();
        // Keep the established direct whole-row/whole-column self-reference
        // behavior: install the formula and let runtime evaluation surface the
        // cycle. Once the walk follows another formula, an unbounded range
        // containing `target` is a real install-time back-edge.
        if self.collect_cycle_refs(expr, target, &mut stack, false) {
            return true;
        }
        let mut seen: HashSet<CellAddress> = HashSet::new();
        while let Some(addr) = stack.pop() {
            if !seen.insert(addr) {
                continue;
            }
            if let Some(next) = self.cycle_expr_for(addr) {
                if self.collect_cycle_refs(&next, target, &mut stack, true) {
                    return true;
                }
            }
        }
        false
    }

    fn has_direct_unbounded_target_ref(expr: &Expr, target: CellAddress) -> bool {
        match expr {
            Expr::Range { start, end, .. } => {
                let range = CellRange::new(*start, *end).normalize();
                (range.end.row == u32::MAX || range.end.col == u32::MAX) && range.contains(target)
            }
            Expr::BinOp { left, right, .. } => {
                Self::has_direct_unbounded_target_ref(left, target)
                    || Self::has_direct_unbounded_target_ref(right, target)
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                Self::has_direct_unbounded_target_ref(inner, target)
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => args
                .iter()
                .any(|arg| Self::has_direct_unbounded_target_ref(arg, target)),
            Expr::DynamicRange { start, end } => {
                Self::has_direct_unbounded_target_ref(start, target)
                    || Self::has_direct_unbounded_target_ref(end, target)
            }
            Expr::Call(callee, args) => {
                Self::has_direct_unbounded_target_ref(callee, target)
                    || args
                        .iter()
                        .any(|arg| Self::has_direct_unbounded_target_ref(arg, target))
            }
            Expr::CellRef(..)
            | Expr::SheetRef { .. }
            | Expr::SheetRange { .. }
            | Expr::Number(_)
            | Expr::Text(_)
            | Expr::Bool(_)
            | Expr::Error(_)
            | Expr::Name(_)
            | Expr::ArrayLit { .. }
            // 空占位实参没有地址。
            | Expr::Omitted
            // Structured reference carries no static A1 ref (design §5.2).
            | Expr::TableRef { .. } => false,
        }
    }

    /// Static cycle check for a formula that was already present in parked
    /// source topology. The temporary reachable graph lets one cold read
    /// certify every reachable non-cyclic formula in O(V+E), while embedded
    /// generation stamps make later reads cut at those formulas. No graph or
    /// edge list survives this call.
    fn closes_parked_local_cycle(
        &self,
        target: CellAddress,
        expr: Rc<Expr>,
        target_checked_at: u64,
    ) -> StaticCycleCheckOutcome {
        let epoch = self.formula_topology_epoch.get();
        if target_checked_at == epoch {
            return StaticCycleCheckOutcome {
                closes_cycle: false,
                target_certified: true,
            };
        }

        let suppress_target_certificate =
            Self::has_direct_unbounded_target_ref(expr.as_ref(), target);
        let mut nodes = vec![StaticCycleNode {
            addr: target,
            expr,
            edges: Vec::new(),
        }];
        let mut node_index: HashMap<CellAddress, usize> = HashMap::new();
        node_index.insert(target, 0);

        let mut cursor = 0;
        while cursor < nodes.len() {
            self.static_cycle_node_visit_count
                .set(self.static_cycle_node_visit_count.get().saturating_add(1));
            let node_expr = Rc::clone(&nodes[cursor].expr);
            let mut refs = Vec::new();
            if self.collect_cycle_refs(node_expr.as_ref(), target, &mut refs, cursor != 0) {
                return StaticCycleCheckOutcome {
                    closes_cycle: true,
                    target_certified: false,
                };
            }

            for addr in refs {
                // The root's direct whole-row/whole-column self-reference is
                // intentionally runtime-checked. Its parked entry was drained
                // before this call, but keep this guard for defensive parity.
                if addr == target {
                    if cursor == 0 && suppress_target_certificate {
                        continue;
                    }
                    return StaticCycleCheckOutcome {
                        closes_cycle: true,
                        target_certified: false,
                    };
                }
                if self.formula_cycle_is_checked(addr, epoch) {
                    continue;
                }
                let Some(next_expr) = self.cycle_expr_for(addr) else {
                    continue;
                };
                let next_index = if let Some(index) = node_index.get(&addr).copied() {
                    index
                } else {
                    let index = nodes.len();
                    node_index.insert(addr, index);
                    nodes.push(StaticCycleNode {
                        addr,
                        expr: next_expr,
                        edges: Vec::new(),
                    });
                    index
                };
                nodes[cursor].edges.push(next_index);
            }
            cursor += 1;
        }

        // Iterative Kosaraju keeps deep spreadsheet chains off the Rust call
        // stack. Both adjacency directions are temporary and released before
        // hydration continues into Store evaluation.
        let mut reverse = vec![Vec::new(); nodes.len()];
        for (from, node) in nodes.iter().enumerate() {
            for &to in &node.edges {
                reverse[to].push(from);
            }
        }

        let mut visited = vec![false; nodes.len()];
        let mut finish_order = Vec::with_capacity(nodes.len());
        for start in 0..nodes.len() {
            if visited[start] {
                continue;
            }
            visited[start] = true;
            let mut stack = vec![(start, 0usize)];
            while let Some(&(node, next_edge)) = stack.last() {
                if next_edge < nodes[node].edges.len() {
                    let next = nodes[node].edges[next_edge];
                    let last = stack.len() - 1;
                    stack[last].1 += 1;
                    if !visited[next] {
                        visited[next] = true;
                        stack.push((next, 0));
                    }
                } else {
                    stack.pop();
                    finish_order.push(node);
                }
            }
        }

        let mut assigned = vec![false; nodes.len()];
        let mut cyclic = vec![false; nodes.len()];
        for &start in finish_order.iter().rev() {
            if assigned[start] {
                continue;
            }
            assigned[start] = true;
            let mut members = Vec::new();
            let mut stack = vec![start];
            while let Some(node) = stack.pop() {
                members.push(node);
                for &next in &reverse[node] {
                    if !assigned[next] {
                        assigned[next] = true;
                        stack.push(next);
                    }
                }
            }
            let is_cycle = members.len() > 1
                || nodes[members[0]]
                    .edges
                    .iter()
                    .any(|&next| next == members[0]);
            if is_cycle {
                for member in members {
                    cyclic[member] = true;
                }
            }
        }

        if cyclic[0] {
            return StaticCycleCheckOutcome {
                closes_cycle: true,
                target_certified: false,
            };
        }
        for index in 1..nodes.len() {
            if !cyclic[index] {
                self.mark_formula_cycle_checked(nodes[index].addr, epoch);
            }
        }
        StaticCycleCheckOutcome {
            closes_cycle: false,
            target_certified: !suppress_target_certificate,
        }
    }

    /// Get a cell's value by address string.
    /// Returns the formula result if the cell has a formula, otherwise the raw value.
    /// Returns Null for cells that haven't been set.
    pub fn get_cell(&self, addr_str: &str) -> Value {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        let value = self.peek_value(addr);
        // A bare Store read intentionally parks newly-computed derived states
        // in pending. Public engine reads are transaction boundaries: settle
        // those states now so an unrelated later write does not inherit work
        // proportional to every formula read since the previous mutation.
        self.store.settle_pending_reads();
        value
    }

    /// Read a cell's current value without creating any atoms. Returns
    /// `Value::Null` for cells that haven't been touched. Used by the
    /// Workbook layer (cross-sheet read) so it can stay `&self`.
    pub fn peek_value(&self, addr: CellAddress) -> Value {
        let provider = SheetEvalProvider {
            sheet: self,
            current_cell: Cell::new(None),
        };
        self.peek_value_with_provider(addr, &provider)
    }


    pub(crate) fn peek_value_with_provider(
        &self,
        addr: CellAddress,
        _provider: &dyn EvalProvider,
    ) -> Value {
        // LAZY_FORMULA_INDEXING Phase 3: hydrate before the
        // `formula_cells` / `cells` branch decision so an unhydrated
        // formula at `addr` doesn't fall through to
        // `primitive_value_at` (which would return whatever stale
        // primitive scaffold the bulk-load left behind). Hydration is
        // idempotent and `&self`-only via internal `RefCell`s.
        self.hydrate_formula(addr);
        let formula = self.interior.formula_cells.borrow().get(&addr).cloned();
        if formula.is_some() {
            let facade = self.facade_of(addr);
            return self.store.get(facade);
        }
        self.cell_value_at(addr).unwrap_or(Value::Null)
    }

    /// Get the AtomId for a cell (creating if needed).
    pub fn cell_atom(&mut self, addr_str: &str) -> AtomId {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.readable_atom(addr)
    }




















    /// Return the original formula text for a cell, or `None` if the cell
    /// holds a value rather than a formula. Required by the formula bar /
    /// double-click-to-edit flow so users see `=A1*2` instead of the
    /// computed result `20` (D.11).
    ///
    /// Takes `&str` so callers can reuse the same address strings. Doesn't
    /// require `&mut self` because no atom creation is involved.
    pub fn get_formula(&self, addr_str: &str) -> Option<String> {
        let addr = CellAddress::parse(addr_str)?;
        // LAZY_FORMULA_INDEXING Phase 3: hydrated formulas live in
        // `formula_texts`, lazy ones live in `formula_source`. Check
        // both so the formula bar shows the source even before first
        // read.
        if let Some(t) = self.interior.formula_texts.borrow().get(&addr) {
            return Some(t.clone());
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|s| s.source.as_ref().to_string())
    }

    /// Is there a formula at `addr`? Used by `ISFORMULA(reference)` via
    /// the `EvalProvider::cell_has_formula` hook.
    pub fn has_formula_at(&self, addr: CellAddress) -> bool {
        // LAZY_FORMULA_INDEXING Phase 3: lazy formulas are still
        // formulas — ISFORMULA must observe them.
        self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr)
    }

    /// Source formula text at `addr`, if any. Used by
    /// `FORMULATEXT(reference)` via the `EvalProvider::cell_formula_text`
    /// hook. Returns a clone of the stored source (leading `=`
    /// included) — the cost is bounded by the formula length, so cloning
    /// per call is acceptable for the formula-bar / `FORMULATEXT` use
    /// case.
    pub fn formula_text_at(&self, addr: CellAddress) -> Option<String> {
        if let Some(t) = self.interior.formula_texts.borrow().get(&addr) {
            return Some(t.clone());
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|s| s.source.as_ref().to_string())
    }































}














impl Default for Sheet {
    fn default() -> Self {
        Self::new()
    }
}

// 单元测试。原来是一个 3,138 行的内联 `mod tests`，现按**被测的东西**拆到
// `sheet_tests/` 下，每个文件一件事。与 `eval_tests/` / `formula/*_tests.rs`
// 同一个约定：`#[path]` 挂在实现文件上，`tests` 仍是 `sheet` 的子模块，因此
// 拿得到本模块的私有项。
#[cfg(test)]
#[path = "sheet_tests/mod.rs"]
mod tests;
