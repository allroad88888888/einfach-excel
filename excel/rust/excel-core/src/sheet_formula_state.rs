//! 公式记录与静态环检测所需的状态。

use super::*;

pub(crate) struct FormulaRecord {
    pub(super) expr: Rc<Expr>,
    /// Formula-topology generation in which static analysis proved this
    /// address is not a member of a same-sheet dependency cycle. This is a
    /// validation certificate only: Store edges remain the sole reactive
    /// dependency graph and the stamp never participates in recomputation.
    pub(super) cycle_checked_at: Cell<u64>,
    /// Static point-cell references (`Expr::CellRef`, plus bounded range
    /// cells expanded by `collect_refs`). Kept on the record for structural
    /// retargeting and debug probes; reactive same-sheet invalidation is
    /// owned by the atom store.
    pub(super) deps: RefCell<HashSet<CellAddress>>,
    /// Static `Expr::Range` metadata used by structural retargeting and cycle
    /// checks. Same-sheet invalidation is owned exclusively by Store edges.
    pub(super) static_ranges: RefCell<HashSet<CellRange>>,
}

impl FormulaRecord {
    pub(super) fn new(
        expr: Rc<Expr>,
        deps: HashSet<CellAddress>,
        static_ranges: HashSet<CellRange>,
    ) -> Self {
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
    pub(super) source: Rc<str>,
    pub(super) cycle_checked_at: Cell<u64>,
}

impl ParkedFormula {
    pub(super) fn new(source: impl Into<Rc<str>>) -> Self {
        Self {
            source: source.into(),
            cycle_checked_at: Cell::new(0),
        }
    }
}

pub(super) struct StaticCycleNode {
    pub(super) addr: CellAddress,
    pub(super) expr: Rc<Expr>,
    pub(super) edges: Vec<usize>,
}

#[derive(Clone, Copy)]
pub(super) struct StaticCycleCheckOutcome {
    pub(super) closes_cycle: bool,
    pub(super) target_certified: bool,
}

pub(super) fn normalize_formula_cell_result(value: Value) -> Value {
    match value {
        Value::Lambda(_) => Value::Error(ValueError::Calc),
        other => other,
    }
}
