//! Sheet 的构造、工作簿挂接与批处理边界。

use super::*;

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
            cell_styles: HashMap::new(),
            row_styles: BTreeMap::new(),
            column_styles: BTreeMap::new(),
            conditional_rules: Vec::new(),
            hidden_rows: BTreeSet::new(),
            hidden_columns: BTreeSet::new(),
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
    pub(super) fn with_remap<R>(
        &mut self,
        _addr: CellAddress,
        f: impl FnOnce(&mut Self) -> R,
    ) -> R {
        f(self)
    }

    pub(super) fn store_batch<R>(&mut self, f: impl FnOnce(&mut Self) -> R) -> R {
        let store = self.store.clone();
        let mut result = None;
        store.batch(|_| {
            result = Some(f(self));
        });
        result.expect("store batch closure did not run")
    }
}
