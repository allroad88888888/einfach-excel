//! 每条集合规则只持有一个原生派生 atom，依赖变化才重新计算范围统计。
use super::*;
use crate::sheet::{ConditionalRangeAtom, ConditionalStatistic};

pub(super) type RangeAtoms = std::cell::RefCell<HashMap<(u64, String), Rc<ConditionalRangeAtom>>>;

impl Workbook {
    pub(super) fn conditional_range_statistics(
        &self, sheet: usize, entry: &ConditionalFormatRuleEntry, statistic: ConditionalStatistic,
    ) -> Value {
        let key = (self.sheet_keys[sheet], entry.id.clone());
        let atom = {
            let mut cache = self.conditional_range_atoms.borrow_mut();
            Rc::clone(cache.entry(key).or_insert_with(|| {
                Rc::new(self.sheets[sheet].create_conditional_range_atom(
                    CellRange::new(CellAddress::new(entry.row_start, entry.col_start),
                        CellAddress::new(entry.row_end, entry.col_end)), statistic,
                ))
            }))
        };
        // 求值之前释放缓存借用，避免公式读取重入时发生 RefCell 冲突。
        atom.read()
    }

    pub(super) fn clear_conditional_range_atoms(&self, sheet: usize) {
        let key = self.sheet_keys[sheet];
        self.conditional_range_atoms.borrow_mut().retain(|(owner, _), _| *owner != key);
    }
}
