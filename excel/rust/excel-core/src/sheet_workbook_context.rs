//! 工作簿级 atom 上下文的状态与基础依赖 epoch。

use super::*;

pub(crate) struct WorkbookAtomContext {
    pub(super) store: Store,
    pub(super) topology: RefCell<WorkbookAtomTopology>,
    pub(super) topology_epoch: RefCell<Option<AtomId>>,
    pub(super) topology_revision: Cell<u64>,
    pub(super) names: RefCell<HashMap<String, Value>>,
    pub(super) names_epoch: RefCell<Option<AtomId>>,
    pub(super) names_revision: Cell<u64>,
    /// Structured-reference Table projection, keyed by uppercased name
    /// (design doc #32 §5.3). Reactive geometry/name-change invalidation is
    /// carried by the `tables_epoch` atom below.
    pub(super) tables: RefCell<HashMap<String, ProjectedTable>>,
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
    pub(super) tables_epoch: RefCell<Option<AtomId>>,
    pub(super) tables_revision: Cell<u64>,
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
    pub(super) eval_hidden_rows: RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    /// Host-pushed per-sheet FILTER-hidden row sets (`design-filter-hidden-rows`
    /// §6.2). Structurally identical to `eval_hidden_rows` above — same keying,
    /// same `Rc` sharing, same whole-set-replace / empty-clears contract — but
    /// kept as an INDEPENDENT store because Excel's two SUBTOTAL layers need
    /// the source distinction: 1-11 exclude filter-hidden rows only, 101-111
    /// exclude both. A merged set could not express that rule.
    pub(super) eval_filter_hidden_rows: RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    /// Reactive invalidation seam for MANUAL hidden-row pushes (design doc #32
    /// §6.2). A SUBTOTAL 101-111 formula's `hidden_rows` resolve does a tracked
    /// read of this epoch (`depend_manual_hidden`); `set_eval_hidden_rows`
    /// `store.set(+1)`s it so ONLY the formulas that consumed a manual hidden
    /// set re-derive. 1-11 never touch this path, hold no edge, and stay
    /// undisturbed by a manual hide/unhide. One shared atom (per the
    /// shared-Store reality) — cross-sheet over-invalidation is a documented
    /// coarseness, identical to `tables_epoch`'s single-atom choice; results
    /// stay correct because the side storage is per-sheet keyed.
    pub(super) manual_hidden_epoch: RefCell<Option<AtomId>>,
    pub(super) manual_hidden_revision: Cell<u64>,
    /// Reactive invalidation seam for FILTER hidden-row pushes
    /// (`design-filter-hidden-rows` §6.4). Deliberately a SEPARATE atom from
    /// `manual_hidden_epoch`: under the new two-layer rule BOTH 1-11 and
    /// 101-111 read the filter set, so sharing one epoch would make every
    /// manual hide/unhide dirty every 1-11 SUBTOTAL in the workbook — a pure
    /// new re-computation cost. With the split, 1-11 hold only the filter edge.
    pub(super) filter_hidden_epoch: RefCell<Option<AtomId>>,
    pub(super) filter_hidden_revision: Cell<u64>,
    pub(super) custom_functions: RefCell<Option<Arc<dyn CustomFunctionRegistry>>>,
    pub(super) custom_epoch: RefCell<Option<AtomId>>,
    pub(super) custom_revision: Cell<u64>,
    pub(super) custom_call_depth: Rc<Cell<usize>>,
    pub(super) in_flight: Rc<RefCell<HashSet<(usize, CellAddress)>>>,
    pub(super) async_custom: RefCell<AsyncCustomState>,
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

    pub(super) fn epoch_atom(&self, slot: &RefCell<Option<AtomId>>, revision: u64) -> AtomId {
        if let Some(id) = *slot.borrow() {
            return id;
        }
        let id = self.store.create_atom(Value::Number(revision as f64));
        *slot.borrow_mut() = Some(id);
        id
    }

    pub(super) fn depend_topology(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.topology_epoch, self.topology_revision.get());
        let _ = args.get(id);
    }

    pub(super) fn depend_names(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.names_epoch, self.names_revision.get());
        let _ = args.get(id);
    }

    pub(super) fn depend_custom(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.custom_epoch, self.custom_revision.get());
        let _ = args.get(id);
    }

    /// Tracked read of the Table-invalidation epoch (design doc #32 §8).
    /// Consulted by both `lookup_table_*` paths — including their MISS
    /// branches — so a formula that references a not-yet-defined Table
    /// re-derives once that Table is created.
    pub(super) fn depend_tables(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.tables_epoch, self.tables_revision.get());
        let _ = args.get(id);
    }

    /// Publish a Table geometry / name change so every structured-reference
    /// formula holding a `depend_tables` edge re-derives (design doc #32 §8).
    /// Driven by `Workbook::bump_tables_epoch` after each registry mutation.
    pub(crate) fn bump_tables_epoch(&self) {
        self.bump_epoch(&self.tables_epoch, &self.tables_revision);
    }
}
