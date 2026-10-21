//! 条件格式的范围统计只读稀疏成员；集合规则共享依赖与释放路径。
use super::*;

pub(crate) enum ConditionalStatistic {
    Duplicates,
    DisplayTextDuplicates,
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
    format_input: Option<AtomId>,
    owned: Rc<Cell<usize>>,
}

impl ConditionalRangeAtom {
    pub(crate) fn read(&self, sheet: &Sheet, ranges: impl Iterator<Item = CellRange>) -> Value {
        if let Some(input) = self.format_input {
            crate::workbook::advanced_formatting::sync_format_input(&self.store, input, sheet, ranges);
        }
        self.store.get(self.atom)
    }
}

impl Drop for ConditionalRangeAtom {
    fn drop(&mut self) {
        if self.store.has_atom(self.atom) {
            self.store.destroy_atom(self.atom);
            self.owned.set(self.owned.get().saturating_sub(1));
        }
        if let Some(input) = self.format_input.filter(|input| self.store.has_atom(*input)) {
            self.store.destroy_atom(input);
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
        let format_input = matches!(statistic, ConditionalStatistic::DisplayTextDuplicates)
            .then(|| ctx.owned_create_atom(Value::Null));
        let atom = ctx.owned_create_derived_ctx({
            let ctx = ctx.clone();
            move |args| {
                let display_keys = format_input.map(|input|
                    crate::workbook::advanced_formatting::read_format_keys(args.get(input))).unwrap_or_default();
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
                    provider.for_each_range_cell(*range, &mut |addr, value| {
                        if matches!(statistic, ConditionalStatistic::Duplicates | ConditionalStatistic::DisplayTextDuplicates) {
                            let key = if matches!(statistic, ConditionalStatistic::DisplayTextDuplicates) {
                                if matches!(value, Value::Number(_)) { display_keys.get(&addr).cloned() }
                                else { crate::workbook::advanced_formatting::display_key(&value, &CellFormat::default()) }
                            } else { crate::workbook::conditional_format_duplicates::value_key(&value) };
                            if let Some(key) = key {
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
                if matches!(statistic, ConditionalStatistic::Duplicates | ConditionalStatistic::DisplayTextDuplicates) {
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
            format_input,
            owned: Rc::clone(&self.atoms_owned),
        }
    }
}

impl ConditionalStatistic {
    fn summarize(&self, numbers: &mut [f64]) -> Value {
        match *self {
            Self::Duplicates | Self::DisplayTextDuplicates => unreachable!("duplicate keys use the sparse value scan"),
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
