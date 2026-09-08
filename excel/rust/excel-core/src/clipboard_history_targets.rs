//! 根据粘贴预检的实际写入目标收集历史范围，不重复解析/推算粘贴行为。
use super::*;

pub(super) fn targets(
    snapshot: &ClipboardSnapshot,
    range: CellRange,
    sheet: usize,
    options: &ClipboardPasteOptions,
    planned: impl Iterator<Item = CellAddress>,
    dependents: &[(usize, CellAddress, String)],
) -> Vec<(usize, CellRange, bool)> {
    let content = options.mode != ClipboardPasteMode::Formats;
    let mut targets = Vec::new();
    if options.skip_blanks {
        // 只记录真正写入的连续行段；跳过的空白位置可能属于 spill，不能撤销时清掉它。
        let mut run: Option<CellRange> = None;
        for addr in planned {
            if let Some(current) = run.as_mut() {
                if addr.row == current.end.row && addr.col == current.end.col + 1 {
                    current.end = addr;
                    continue;
                }
                targets.push((sheet, *current, content));
            }
            run = Some(CellRange::single(addr));
        }
        if let Some(run) = run {
            targets.push((sheet, run, content));
        }
    } else {
        targets.push((sheet, range, content));
    }
    if snapshot.cut {
        targets.push((sheet, snapshot.source, true));
    }
    targets.extend(
        dependents
            .iter()
            .map(|(sheet, addr, _)| (*sheet, CellRange::single(*addr), true)),
    );
    targets
}

/// UI 尺寸缓存需要主表完整受影响的行列范围；快照本身仍按实际多区保存。
pub(super) fn affected_range(
    snapshot: &ClipboardSnapshot,
    mut range: CellRange,
    sheet: usize,
    dependents: &[(usize, CellAddress, String)],
) -> CellRange {
    let mut include = |other: CellRange| {
        range.start.row = range.start.row.min(other.start.row);
        range.start.col = range.start.col.min(other.start.col);
        range.end.row = range.end.row.max(other.end.row);
        range.end.col = range.end.col.max(other.end.col);
    };
    if snapshot.cut {
        include(snapshot.source);
    }
    for (index, addr, _) in dependents {
        if *index == sheet {
            include(CellRange::single(*addr));
        }
    }
    range
}
