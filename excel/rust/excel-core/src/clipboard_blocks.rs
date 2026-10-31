//! 多块复制的几何：同列的块按行堆叠，同行的块按列并排；其它组合与 Excel 一样拒绝。
use super::{validate_range, ClipboardError, MAX_CLIPBOARD_CELLS};
use crate::{CellAddress, CellRange};

/// 返回包围盒、实际源行与实际源列（均升序去重）。分配前先按块面积上限拒绝。
pub(super) fn resolve(blocks: &[CellRange]) -> Result<(CellRange, Vec<u32>, Vec<u32>), ClipboardError> {
    let first = *blocks.first().ok_or("CLIPBOARD_INVALID_RANGE")?;
    let mut bounds = first;
    let mut area = 0u64;
    for block in blocks {
        validate_range(*block)?;
        area += u64::from(block.rows()) * u64::from(block.cols());
        bounds = CellRange::new(
            CellAddress::new(bounds.start.row.min(block.start.row), bounds.start.col.min(block.start.col)),
            CellAddress::new(bounds.end.row.max(block.end.row), bounds.end.col.max(block.end.col)),
        );
    }
    if area > MAX_CLIPBOARD_CELLS {
        return Err("CLIPBOARD_TOO_LARGE");
    }
    if blocks.len() == 1 {
        return Ok((first, (first.start.row..=first.end.row).collect(), (first.start.col..=first.end.col).collect()));
    }
    let same_cols = blocks.iter().all(|b| b.start.col == first.start.col && b.end.col == first.end.col);
    let same_rows = blocks.iter().all(|b| b.start.row == first.start.row && b.end.row == first.end.row);
    let union = |pick: fn(&CellRange) -> (u32, u32)| {
        let mut values: Vec<u32> = blocks.iter().flat_map(|b| { let (s, e) = pick(b); s..=e }).collect();
        values.sort_unstable();
        values.dedup();
        values
    };
    let rows = |b: &CellRange| (b.start.row, b.end.row);
    let cols = |b: &CellRange| (b.start.col, b.end.col);
    if same_cols {
        Ok((bounds, union(rows), (first.start.col..=first.end.col).collect()))
    } else if same_rows {
        Ok((bounds, (first.start.row..=first.end.row).collect(), union(cols)))
    } else {
        Err("CLIPBOARD_MULTI_SHAPE")
    }
}

/// 升序集合里是否有元素落在 `start..=end`。
pub(super) fn touches(sorted: &[u32], start: u32, end: u32) -> bool {
    sorted.get(sorted.partition_point(|v| *v < start)).is_some_and(|v| *v <= end)
}

/// 升序集合是否包含 `start..=end` 的每一个整数。
pub(super) fn covers(sorted: &[u32], start: u32, end: u32) -> bool {
    let at = sorted.partition_point(|v| *v < start);
    sorted.get(at..at + (end - start + 1) as usize)
        .is_some_and(|slice| slice.last() == Some(&end))
}
