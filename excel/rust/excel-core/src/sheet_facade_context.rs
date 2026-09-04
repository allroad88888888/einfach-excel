//! 单元格 facade 与公式内部 atom 的创建上下文。

use super::*;

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
    pub(super) store: Store,
    pub(super) atoms_owned: Rc<Cell<usize>>,
    pub(super) interior: Rc<SheetInterior>,
    pub(super) slot_epoch_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    pub(super) cell_facade_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P4c: shared per-address formula-inner atom family — see the field of
    /// the same name on [`Sheet`]. The facade for a formula address delegates
    /// to `formula_inner_of(addr)`.
    pub(super) formula_inner_family: Rc<RefCell<AtomFamily<CellAddress>>>,
    /// P5 Tier-B geometry atom families — see [`Sheet`].
    pub(super) range_band_epoch_family: Rc<RefCell<AtomFamily<RangeBandKey>>>,
    pub(super) range_column_epoch_family: Rc<RefCell<AtomFamily<RangeColumnKey>>>,
    pub(super) range_sheet_epoch_family: Rc<RefCell<AtomFamily<()>>>,
    /// P4c: shared mid-evaluation address set for the runtime cycle guard
    /// (codex F1) — see the field of the same name on [`Sheet`].
    pub(super) in_flight: Rc<RefCell<HashSet<CellAddress>>>,
    pub(super) workbook_context: Rc<RefCell<Option<Weak<WorkbookAtomContext>>>>,
    pub(super) workbook_sheet_index: Rc<Cell<Option<usize>>>,
    pub(super) formula_eval_count: Rc<Cell<usize>>,
}

impl FacadeCtx {
    pub(super) fn workbook_scope(&self) -> Option<(Rc<WorkbookAtomContext>, usize)> {
        let context = self
            .workbook_context
            .borrow()
            .as_ref()
            .and_then(Weak::upgrade)?;
        Some((context, self.workbook_sheet_index.get()?))
    }

    pub(super) fn is_in_flight(&self, addr: CellAddress) -> bool {
        if let Some((context, sheet_idx)) = self.workbook_scope() {
            return context.in_flight.borrow().contains(&(sheet_idx, addr));
        }
        self.in_flight.borrow().contains(&addr)
    }

    /// `owned_create_atom` mirror — keeps `atoms_owned` exact from within a
    /// `'static` closure that has no `&Sheet`.
    pub(super) fn owned_create_atom(&self, value: Value) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_atom(value)
    }

    /// `owned_create_derived_ctx` mirror (lazy — computes nothing until first
    /// read, INV-7).
    pub(super) fn owned_create_derived_ctx(
        &self,
        read_fn: impl Fn(&ReadArgs) -> Value + 'static,
    ) -> AtomId {
        self.atoms_owned.set(self.atoms_owned.get() + 1);
        self.store.create_derived_ctx(read_fn)
    }

    /// The lazy slot-epoch primitive for an address (one per address). Bumped
    /// whenever the inner atom identity changes so the facade re-derives off a
    /// swap. Created on demand.
    pub(super) fn epoch_of(&self, addr: CellAddress) -> AtomId {
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
    pub(super) fn get_or_create_facade(&self, addr: CellAddress) -> AtomId {
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
    pub(super) fn formula_expr_for(&self, addr: CellAddress) -> Option<Rc<Expr>> {
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
    pub(super) fn formula_inner_of(&self, addr: CellAddress) -> AtomId {
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

    pub(super) fn eval_formula_inner(&self, addr: CellAddress, args: &ReadArgs) -> Value {
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
}
