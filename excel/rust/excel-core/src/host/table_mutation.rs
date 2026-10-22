//! Table 事务公开本次实际覆盖的局部范围，公式消费者保留自己的表坐标。
use super::*;

impl TableDefinitionChange {
    pub(crate) fn mutation_ranges(&self) -> Vec<(usize, Option<CellRange>)> {
        std::iter::once((self.sheet, Some(self.range)))
            .chain(self.cells.iter().flat_map(|(before, after)|
                crate::host::changed_ranges(before, after).into_iter().map(|range| (self.sheet, Some(range)))))
            .chain(self.formulas.iter().map(|change| (change.sheet, change.mutation_range())))
            .collect()
    }
}
