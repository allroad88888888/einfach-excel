//! 排名阈值是一个派生 atom：只读稀疏数值成员，依赖变化后才重新选择第 N 项。
use super::*;

pub(crate) struct RankThreshold {
    store: Store,
    atom: AtomId,
    owned: Rc<Cell<usize>>,
}

impl RankThreshold {
    pub(crate) fn read(&self) -> Option<f64> {
        match self.store.get(self.atom) {
            Value::Number(value) => Some(value),
            _ => None,
        }
    }
}

impl Drop for RankThreshold {
    fn drop(&mut self) {
        if self.store.has_atom(self.atom) {
            self.store.destroy_atom(self.atom);
            self.owned.set(self.owned.get().saturating_sub(1));
        }
    }
}

impl Sheet {
    pub(crate) fn create_rank_threshold(
        &self,
        range: CellRange,
        count: u32,
        percent: bool,
        bottom: bool,
    ) -> RankThreshold {
        let ctx = self.facade_ctx();
        let atom = ctx.owned_create_derived_ctx({
            let ctx = ctx.clone();
            move |args| {
                let provider = AtomFormulaProvider {
                    args,
                    ctx: ctx.clone(),
                    current_cell: Cell::new(None),
                };
                let mut numbers = Vec::new();
                provider.for_each_range_cell(range, &mut |_, value| {
                    if let Value::Number(number) = value {
                        if number.is_finite() {
                            numbers.push(number);
                        }
                    }
                });
                if numbers.is_empty() {
                    return Value::Null;
                }
                // 百分比基于数值成员数，按整数除法向下取整；阈值并列项全部命中。
                let take = if percent {
                    (numbers.len() as u64 * u64::from(count) / 100) as usize
                } else {
                    count as usize
                }
                .min(numbers.len());
                if take == 0 {
                    return Value::Null;
                }
                let index = if bottom {
                    take - 1
                } else {
                    numbers.len() - take
                };
                let (_, threshold, _) = numbers.select_nth_unstable_by(index, f64::total_cmp);
                Value::Number(*threshold)
            }
        });
        RankThreshold {
            store: self.store.clone(),
            atom,
            owned: Rc::clone(&self.atoms_owned),
        }
    }
}
