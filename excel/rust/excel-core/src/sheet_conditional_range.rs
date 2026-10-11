//! 条件格式的范围统计只读稀疏数值成员；排名、色阶和数据条共享依赖与释放路径。
use super::*;

pub(crate) enum ConditionalStatistic {
    Rank {
        count: u32,
        percent: bool,
        bottom: bool,
    },
    Bounds {
        median: bool,
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
                // 范围在写入前已确保不相交，统计每个稀疏成员一次。
                for range in &ranges {
                    provider.for_each_range_cell(*range, &mut |_, value| {
                        if let Value::Number(number) = value {
                            if number.is_finite() {
                                numbers.push(number);
                            }
                        }
                    });
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
            Self::Bounds { median } => {
                let min = numbers.iter().copied().fold(f64::INFINITY, f64::min);
                let max = numbers.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let middle = if median {
                    let even = numbers.len() % 2 == 0;
                    let index = numbers.len() / 2;
                    let (lower, upper, _) = numbers.select_nth_unstable_by(index, f64::total_cmp);
                    if even {
                        let lower = lower.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                        let sum = lower + *upper;
                        // 先相加，避免极小数分别减半后归零；和溢出时才分别减半。
                        if sum.is_finite() {
                            sum / 2.0
                        } else {
                            lower / 2.0 + *upper / 2.0
                        }
                    } else {
                        *upper
                    }
                } else {
                    min
                };
                Value::Array(Arc::new(ArrayData::new(
                    1,
                    3,
                    vec![
                        Value::Number(min),
                        Value::Number(middle),
                        Value::Number(max),
                    ],
                )))
            }
        }
    }
}
