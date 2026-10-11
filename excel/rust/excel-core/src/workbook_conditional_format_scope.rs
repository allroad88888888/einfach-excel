//! 一条条件规则的多矩形作用范围；主矩形保留公式原点，不引入第二份规则目录。
use super::*;

impl ConditionalFormatRuleEntry {
    pub fn ranges(&self) -> impl Iterator<Item = CellRange> + '_ {
        std::iter::once(CellRange::new(CellAddress::new(self.row_start, self.col_start),
            CellAddress::new(self.row_end, self.col_end)))
            .chain(self.additional_ranges.iter().copied())
    }

    pub(super) fn set_ranges(&mut self, ranges: Vec<CellRange>) {
        let first = ranges[0];
        self.row_start = first.start.row;
        self.row_end = first.end.row;
        self.col_start = first.start.col;
        self.col_end = first.end.col;
        self.additional_ranges = ranges.into_iter().skip(1).collect();
    }

    pub(super) fn contains(&self, row: u32, col: u32) -> bool {
        self.ranges().any(|range| range.contains(CellAddress::new(row, col)))
    }

    pub(super) fn valid_ranges(&self) -> bool {
        if self.additional_ranges.len() >= 4096 { return false; }
        let ranges: Vec<_> = self.ranges().collect();
        ranges.iter().enumerate().all(|(index, range)| {
            range.start.row <= range.end.row && range.start.col <= range.end.col
                && range.end.row <= GRID_MAX_ROW && range.end.col <= GRID_MAX_COL
                && ranges[..index].iter().all(|other| !other.intersects(*range))
        })
    }
}
