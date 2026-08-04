//! 公式求值重入的哨兵。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// RAII marker for the runtime cycle guard (codex F1). While a formula-inner
/// read_fn is executing, its address sits in the shared `in_flight` set; a
/// referenced cell that is already in-flight is a runtime cycle and reads back
/// `#CYCLE!` (see [`AtomFormulaProvider::read_facade`]). The guard removes the
/// address on drop — but ONLY if it was the one that inserted it, so a
/// re-entrant read of the same address (which cannot happen under the store's
/// computing-guard, but is cheap to be correct about) never clears a peer's
/// membership.
pub(super) enum InFlightSet {
    Local(Rc<RefCell<HashSet<CellAddress>>>),
    Workbook(Rc<WorkbookAtomContext>, usize),
}

pub(super) struct InFlightGuard {
    pub(super) set: InFlightSet,
    pub(super) addr: CellAddress,
    pub(super) inserted: bool,
}

impl InFlightGuard {
    pub(super) fn enter(ctx: &FacadeCtx, addr: CellAddress) -> Self {
        let (set, inserted) = if let Some((context, sheet_idx)) = ctx.workbook_scope() {
            let inserted = context.in_flight.borrow_mut().insert((sheet_idx, addr));
            (InFlightSet::Workbook(context, sheet_idx), inserted)
        } else {
            let set = Rc::clone(&ctx.in_flight);
            let inserted = set.borrow_mut().insert(addr);
            (InFlightSet::Local(set), inserted)
        };
        InFlightGuard {
            set,
            addr,
            inserted,
        }
    }
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        if self.inserted {
            match &self.set {
                InFlightSet::Local(set) => {
                    set.borrow_mut().remove(&self.addr);
                }
                InFlightSet::Workbook(context, sheet_idx) => {
                    context
                        .in_flight
                        .borrow_mut()
                        .remove(&(*sheet_idx, self.addr));
                }
            }
        }
    }
}
