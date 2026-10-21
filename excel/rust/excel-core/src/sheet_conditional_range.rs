//! 条件格式的范围统计只读稀疏成员；集合规则共享依赖与释放路径。
use super::*;

pub(crate) enum ConditionalStatistic {
    Duplicates,
    SortedNumbers,
    Rank {
        count: u32,
        percent: bool,
        bottom: bool,
    },
}

pub(crate) struct ConditionalRangeAtom {
    store: Store,
    atom: AtomId,
    owned: Rc<Cell<usize>>,
}

impl ConditionalRangeAtom {
    pub(crate) fn read(&self) -> Value {
        self.store.get(self.atom)
    }
}

impl Drop for ConditionalRangeAtom {
    fn drop(&mut self) {
        if self.store.has_atom(self.atom) {
            self.store.destroy_atom(self.atom);
            self.owned.set(self.owned.get().saturating_sub(1));
        }
    }
}

impl Sheet {
    pub(crate) fn create_conditional_range_atom(
        &self,
        ranges: Vec<CellRange>,
        statistic: ConditionalStatistic,
    ) -> ConditionalRangeAtom {
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
                let mut seen = std::collections::BTreeSet::new();
                let mut duplicates = std::collections::BTreeSet::new();
                // 范围在写入前已确保不相交，统计每个稀疏成员一次。
                for range in &ranges {
                    provider.for_each_range_cell(*range, &mut |_, value| {
                        if matches!(statistic, ConditionalStatistic::Duplicates) {
                            if let Some(key) =
                                crate::workbook::conditional_format_duplicates::value_key(&value)
                            {
                                if !seen.insert(key.clone()) {
                                    duplicates.insert(key);
                                }
                            }
                            return;
                        }
                        if let Value::Number(number) = value {
                            if number.is_finite() {
                                numbers.push(number);
                            }
                        }
                    });
                }
                if matches!(statistic, ConditionalStatistic::Duplicates) {
                    let keys = duplicates
                        .into_iter()
                        .map(|key| Value::Text(key.into()))
                        .collect::<Vec<_>>();
                    return Value::Array(Arc::new(ArrayData::new(keys.len() as u32, 1, keys)));
                }
                if numbers.is_empty() {
                    return Value::Null;
                }
                statistic.summarize(&mut numbers)
            }
        });
        ConditionalRangeAtom {
            store: self.store.clone(),
            atom,
            owned: Rc::clone(&self.atoms_owned),
        }
    }
}

impl ConditionalStatistic {
    fn summarize(&self, numbers: &mut [f64]) -> Value {
        match *self {
            Self::Duplicates => unreachable!("duplicate keys use the sparse value scan"),
            Self::SortedNumbers => {
                numbers.sort_by(f64::total_cmp);
                Value::Array(Arc::new(ArrayData::new(
                    1, numbers.len() as u32,
                    numbers.iter().copied().map(Value::Number).collect(),
                )))
            }
            Self::Rank {
                count,
                percent,
                bottom,
            } => {
                // 百分比向下取整，阈值并列项由显示规则全部命中。
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
                Value::Number(*numbers.select_nth_unstable_by(index, f64::total_cmp).1)
            }
        }
    }
}
