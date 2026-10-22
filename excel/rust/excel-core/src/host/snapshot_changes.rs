//! 从事务已持有的稀疏前后像提取真实位置，不再扫描工作表或把整张选区当作修改。
use crate::history_snapshot::HistorySnapshot;
use crate::{CellAddress, CellRange};
use std::collections::{BTreeMap, BTreeSet};

fn changed_keys<'a, K: Ord + Copy, V: PartialEq + 'a>(
    before: impl Iterator<Item = (K, &'a V)>, after: impl Iterator<Item = (K, &'a V)>,
) -> Vec<K> {
    let before: BTreeMap<_, _> = before.collect();
    let after: BTreeMap<_, _> = after.collect();
    before.keys().chain(after.keys()).copied().collect::<BTreeSet<_>>().into_iter()
        .filter(|key| before.get(key) != after.get(key)).collect()
}

pub(crate) fn changed_ranges(before: &HistorySnapshot, after: &HistorySnapshot) -> Vec<CellRange> {
    let coord = |addr: CellAddress| (addr.row, addr.col);
    let mut points = changed_keys(
        before.cells.iter().flatten().map(|cell| (coord(cell.addr), cell)),
        after.cells.iter().flatten().map(|cell| (coord(cell.addr), cell)),
    );
    points.extend(changed_keys(
        before.formats.cell_styles.iter().map(|(addr, style)| (coord(*addr), style)),
        after.formats.cell_styles.iter().map(|(addr, style)| (coord(*addr), style)),
    ));
    points.extend(changed_keys(
        before.hyperlinks.iter().map(|(addr, value)| (coord(*addr), value)),
        after.hyperlinks.iter().map(|(addr, value)| (coord(*addr), value)),
    ));
    points.extend(changed_keys(
        before.notes.iter().map(|(addr, value)| (coord(*addr), value)),
        after.notes.iter().map(|(addr, value)| (coord(*addr), value)),
    ));
    points.extend(changed_keys(
        before.comments.iter().map(|(addr, value)| (coord(*addr), value)),
        after.comments.iter().map(|(addr, value)| (coord(*addr), value)),
    ));
    let mut ranges = Vec::new();
    if let Some(&(row, col)) = points.first() {
        let mut range = CellRange::single(CellAddress::new(row, col));
        for (row, col) in points {
            range.start.row = range.start.row.min(row);
            range.start.col = range.start.col.min(col);
            range.end.row = range.end.row.max(row);
            range.end.col = range.end.col.max(col);
        }
        ranges.push(range);
    }
    // 行/列样式与轴尺寸是真实全轴元数据，不能只报告输入格所在的小窗口。
    ranges.extend(changed_keys(
        before.formats.row_styles.iter().map(|(index, style)| (*index, style)),
        after.formats.row_styles.iter().map(|(index, style)| (*index, style)),
    ).into_iter().map(|row| CellRange::new(CellAddress::new(row, 0), CellAddress::new(row, 16_383))));
    let mut columns = changed_keys(
        before.formats.column_styles.iter().map(|(index, style)| (*index, style)),
        after.formats.column_styles.iter().map(|(index, style)| (*index, style)),
    );
    columns.extend(changed_keys(before.column_widths.iter().map(|(index, width)| (*index, width)),
        after.column_widths.iter().map(|(index, width)| (*index, width))));
    ranges.extend(columns.into_iter().collect::<BTreeSet<_>>().into_iter()
        .map(|col| CellRange::new(CellAddress::new(0, col), CellAddress::new(1_048_575, col))));
    if before.merges != after.merges {
        ranges.extend(before.merges.iter().chain(after.merges.iter()).flatten().copied());
    }
    ranges
}
