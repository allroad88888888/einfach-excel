//! Large ranges read ordinary values without allocating a facade per member.
use super::*;

impl AtomFormulaProvider<'_, '_> {
    pub(super) fn read_range_member_from(&self, ctx: &FacadeCtx, addr: CellAddress) -> Value {
        // Formula and spill reads retain facade cycle/projection semantics.
        let formula = ctx.interior.formula_cells.borrow().contains_key(&addr)
            || ctx.interior.formula_source.borrow().contains_key(&addr);
        if formula {
            return self.read_facade_from(ctx, addr);
        }
        let slot = ctx.interior.cells.borrow().get(&addr).cloned();
        match slot {
            Some(CellSlot::Plain(value)) => {
                // The address epoch tracks replacement/promotion of the parked value.
                // This still retains one lazily created epoch per visited Plain
                // address, reused on later reads. Range geometry epochs alone
                // cannot replace these value dependencies.
                let _ = self.args.get(ctx.epoch_of(addr));
                value
            }
            // Existing atoms keep their facade: one member edge is cheaper to
            // revalidate than separate epoch + value edges on every recompute.
            // This also preserves spill-target projection semantics.
            _ => self.read_facade_from(ctx, addr),
        }
    }
}
