//! 共边只是一条线：一次操作同步两侧 cellStyle，不存额外边表或时间戳。
use super::*;
use crate::{BorderSpec, BorderStyle, CellBorders};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BorderPreset {
    All,
    Outside,
    Inside,
    Horizontal,
    Vertical,
    Top,
    Right,
    Bottom,
    Left,
    None,
}

/// 仅活在当前命令内的变更计划，供原生历史先捕获实际影响范围。
pub(crate) type BorderPlan = HashMap<CellAddress, CellBorders>;

impl Sheet {
    pub fn patch_range_borders(
        &mut self,
        range: CellRange,
        preset: BorderPreset,
        border: BorderSpec,
    ) -> Result<usize, &'static str> {
        let writes = self.plan_range_borders(range, preset, border)?;
        Ok(self.apply_border_plan(writes))
    }

    pub(crate) fn plan_range_borders(
        &self,
        range: CellRange,
        preset: BorderPreset,
        border: BorderSpec,
    ) -> Result<BorderPlan, &'static str> {
        let range = range.normalize();
        self.validate_merge_range(range)?;
        let count = u64::from(range.end.row - range.start.row + 1)
            * u64::from(range.end.col - range.start.col + 1);
        if count > 100_000 {
            return Err("Border selection exceeds 100,000 cells. Choose a smaller range.");
        }
        let border = if preset == BorderPreset::None {
            BorderSpec::default()
        } else {
            border
        };
        let mut writes = BorderPlan::new();
        for addr in range.iter() {
            let cell = self
                .merged_range_at(addr)
                .unwrap_or(CellRange::single(addr));
            if addr != cell.start {
                continue;
            }
            let outer = [
                cell.start.row == range.start.row,
                cell.end.col == range.end.col,
                cell.end.row == range.end.row,
                cell.start.col == range.start.col,
            ];
            let selected = match preset {
                BorderPreset::All | BorderPreset::None => [true; 4],
                BorderPreset::Outside => outer,
                BorderPreset::Inside => outer.map(|edge| !edge),
                BorderPreset::Horizontal => [!outer[0], false, !outer[2], false],
                BorderPreset::Vertical => [false, !outer[1], false, !outer[3]],
                BorderPreset::Top => [outer[0], false, false, false],
                BorderPreset::Right => [false, outer[1], false, false],
                BorderPreset::Bottom => [false, false, outer[2], false],
                BorderPreset::Left => [false, false, false, outer[3]],
            };
            for (side, selected) in selected.into_iter().enumerate() {
                if !selected {
                    continue;
                }
                self.plan_border_side(&mut writes, addr, side, &border);
                let horizontal = side % 2 == 0;
                let start = if horizontal {
                    cell.start.col
                } else {
                    cell.start.row
                };
                let end = if horizontal {
                    cell.end.col
                } else {
                    cell.end.row
                };
                for index in start..=end {
                    let edge = match side {
                        0 => CellAddress::new(cell.start.row, index),
                        1 => CellAddress::new(index, cell.end.col),
                        2 => CellAddress::new(cell.end.row, index),
                        _ => CellAddress::new(index, cell.start.col),
                    };
                    self.plan_border_side(&mut writes, edge, side, &border);
                    if let Some(neighbour) = adjacent(edge, side) {
                        self.plan_border_side(&mut writes, neighbour, (side + 2) % 4, &border);
                        // 相邻合并格整条边被覆盖时同步锚点；部分相交只改实际边段。
                        if let Some(merge) = self.merged_range_at(neighbour) {
                            let (lo, hi) = if horizontal {
                                (merge.start.col, merge.end.col)
                            } else {
                                (merge.start.row, merge.end.row)
                            };
                            if start <= lo && end >= hi {
                                self.plan_border_side(
                                    &mut writes,
                                    merge.start,
                                    (side + 2) % 4,
                                    &border,
                                );
                            }
                        }
                    }
                }
            }
        }
        writes.retain(|addr, borders| *borders != self.base_format_at(*addr).borders);
        Ok(writes)
    }

    pub(super) fn plan_border_side(
        &self,
        writes: &mut BorderPlan,
        addr: CellAddress,
        side: usize,
        border: &BorderSpec,
    ) {
        let merged = self.merged_range_at(addr);
        let fallback = merged.map(|merge| self.base_format_at(merge.start).borders);
        // 旧合并格式可能只存在锚点。改变首段前固定其它段的旧值，避免把首段新色
        // 当成整边的新默认值；只枚举这一条外沿，不展开合并内部或扫描工作表。
        if let Some(merge) = merged.filter(|merge| merge.start == addr && (side == 0 || side == 3))
        {
            let anchor = writes
                .get(&addr)
                .cloned()
                .unwrap_or_else(|| self.base_format_at(addr).borders);
            let old = border_side(&anchor, side).cloned().unwrap_or_default();
            if old != *border {
                let end = if side == 0 {
                    merge.end.col
                } else {
                    merge.end.row
                };
                let start = if side == 0 {
                    merge.start.col
                } else {
                    merge.start.row
                };
                for index in start + 1..=end {
                    let edge = if side == 0 {
                        CellAddress::new(addr.row, index)
                    } else {
                        CellAddress::new(index, addr.col)
                    };
                    let borders = writes
                        .entry(edge)
                        .or_insert_with(|| self.base_format_at(edge).borders);
                    let target = if side == 0 {
                        &mut borders.top
                    } else {
                        &mut borders.left
                    };
                    if target.is_none() {
                        *target = Some(old.clone());
                    }
                }
            }
        }
        let borders = writes
            .entry(addr)
            .or_insert_with(|| self.base_format_at(addr).borders);
        let target = match side {
            0 => &mut borders.top,
            1 => &mut borders.right,
            2 => &mut borders.bottom,
            _ => &mut borders.left,
        };
        // 明确 none 可表达合并边段的清除，但空白格不因重复清除制造历史。
        if border.style == BorderStyle::None
            && target
                .as_ref()
                .or_else(|| fallback.as_ref().and_then(|b| border_side(b, side)))
                .is_none_or(|b| b.style == BorderStyle::None)
        {
            return;
        }
        *target = Some(border.clone());
    }

    pub(crate) fn apply_border_plan(&mut self, writes: BorderPlan) -> usize {
        if writes.is_empty() {
            return 0;
        }
        for (addr, borders) in &writes {
            self.cell_styles.entry(*addr).or_default().borders = Some(borders.clone());
        }
        self.notify_style_subscribers(|addr| writes.contains_key(&addr))
    }
}

pub(super) fn border_side(borders: &CellBorders, side: usize) -> Option<&BorderSpec> {
    match side {
        0 => borders.top.as_ref(),
        1 => borders.right.as_ref(),
        2 => borders.bottom.as_ref(),
        _ => borders.left.as_ref(),
    }
}

pub(super) fn adjacent(addr: CellAddress, side: usize) -> Option<CellAddress> {
    match side {
        0 => addr
            .row
            .checked_sub(1)
            .map(|row| CellAddress::new(row, addr.col)),
        1 => (addr.col + 1 < EXCEL_MAX_COLS).then(|| CellAddress::new(addr.row, addr.col + 1)),
        2 => (addr.row + 1 < EXCEL_MAX_ROWS).then(|| CellAddress::new(addr.row + 1, addr.col)),
        _ => addr
            .col
            .checked_sub(1)
            .map(|col| CellAddress::new(addr.row, col)),
    }
}

/// 历史只扩大到本次实际改动的样式地址，不把它作为用户的新选区。
pub(crate) fn border_plan_range(writes: &BorderPlan) -> Option<CellRange> {
    writes.keys().fold(None, |range, addr| {
        let mut range = range.unwrap_or(CellRange::single(*addr));
        range.start.row = range.start.row.min(addr.row);
        range.start.col = range.start.col.min(addr.col);
        range.end.row = range.end.row.max(addr.row);
        range.end.col = range.end.col.max(addr.col);
        Some(range)
    })
}
