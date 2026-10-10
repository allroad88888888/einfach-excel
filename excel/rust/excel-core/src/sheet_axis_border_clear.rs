//! 整行／整列清格式的共边：只补已有样式交叉点，不展开整条轴。
use super::*;
use crate::{BorderSpec, BorderStyle, CellBorders, StyleScope};

impl Sheet {
    pub(crate) fn plan_axis_border_clear(
        &self,
        range: CellRange,
        scope: StyleScope,
        addresses: &mut HashSet<CellAddress>,
    ) -> Vec<(CellRange, CellBorders)> {
        let rows = scope == StyleScope::Row;
        let (start, end, limit) = if rows {
            (range.start.row, range.end.row, EXCEL_MAX_ROWS)
        } else {
            (range.start.col, range.end.col, EXCEL_MAX_COLS)
        };
        let point = |axis, cross| {
            if rows {
                CellAddress::new(axis, cross)
            } else {
                CellAddress::new(cross, axis)
            }
        };
        // 对向轴的格式会在 patch 时物化为 cellStyle；提前把这些交叉点纳入共边计划。
        let crossings: Vec<_> = if rows {
            self.column_styles
                .iter()
                .filter_map(|(index, style)| style.borders.is_some().then_some(*index))
                .collect()
        } else {
            self.row_styles
                .iter()
                .filter_map(|(index, style)| style.format.borders.is_some().then_some(*index))
                .collect()
        };
        for axis in start..=end {
            addresses.extend(crossings.iter().map(|cross| point(axis, *cross)));
        }
        let neighbours = [start.checked_sub(1), (end + 1 < limit).then_some(end + 1)];
        // 邻轴独有的 cellStyle 也可能留有共享边，选中轴对应位置不一定有 cellStyle。
        for addr in self.cell_styles.keys() {
            let (axis, cross) = if rows {
                (addr.row, addr.col)
            } else {
                (addr.col, addr.row)
            };
            if neighbours[0] == Some(axis) {
                addresses.insert(point(start, cross));
            } else if neighbours[1] == Some(axis) {
                addresses.insert(point(end, cross));
            }
        }
        let mut writes = Vec::new();
        for (before, neighbour) in neighbours.into_iter().enumerate() {
            let Some(index) = neighbour else { continue };
            let original = if rows {
                self.row_styles
                    .get(&index)
                    .and_then(|s| s.format.borders.as_ref())
            } else {
                self.column_styles
                    .get(&index)
                    .and_then(|s| s.borders.as_ref())
            };
            let Some(mut borders) = original.cloned() else {
                continue;
            };
            let edge = match (rows, before == 0) {
                (true, true) => &mut borders.bottom,
                (true, false) => &mut borders.top,
                (false, true) => &mut borders.right,
                (false, false) => &mut borders.left,
            };
            if edge
                .as_ref()
                .is_none_or(|edge| edge.style == BorderStyle::None)
            {
                continue;
            }
            *edge = Some(BorderSpec::default());
            let cross_end = if rows { EXCEL_MAX_COLS } else { EXCEL_MAX_ROWS } - 1;
            writes.push((
                CellRange::new(point(index, 0), point(index, cross_end)),
                borders,
            ));
        }
        writes
    }

    pub(crate) fn apply_axis_border_clear(
        &mut self,
        scope: StyleScope,
        writes: Vec<(CellRange, CellBorders)>,
    ) {
        for (range, borders) in writes {
            // 只改轴自身的边框。普通 patch 会覆盖邻轴 cellStyle 的其它边，不能复用。
            if scope == StyleScope::Row {
                self.row_styles
                    .entry(range.start.row)
                    .or_default()
                    .format
                    .borders = Some(borders);
            } else {
                self.column_styles
                    .entry(range.start.col)
                    .or_default()
                    .borders = Some(borders);
            }
            self.notify_style_subscribers(|addr| range.contains(addr));
        }
    }
}
