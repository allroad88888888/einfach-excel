//! 定位条件只读原生稀疏索引；空白取矩形补集，不展开理论网格。
use crate::{CellAddress, CellRange, Workbook};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocateKind {
    Constants,
    Formulas,
    Blanks,
}

#[derive(Debug, PartialEq, Eq)]
pub struct LocatedCells {
    /// 查询边界包含完整合并格；调用方应显示原生实际查询范围。
    pub scope: CellRange,
    pub ranges: Vec<CellRange>,
    /// 实际选中的格子数，包括合并范围覆盖的坐标；整张表须使用 u64。
    pub cell_count: u64,
}

impl Workbook {
    pub fn locate_cells(
        &self,
        sheet: usize,
        mut range: CellRange,
        kind: LocateKind,
        region_limit: usize,
    ) -> Result<LocatedCells, &'static str> {
        let source = self.sheet(sheet).ok_or("Invalid locate worksheet.")?;
        if range != range.normalize() || range.end.row >= 1_048_576 || range.end.col >= 16_384 {
            return Err("Invalid locate range.");
        }
        if region_limit == 0 || region_limit > 500 {
            return Err("Locate region limit must be between 1 and 500.");
        }
        // 与普通选区一致：范围碰到合并格时包住整格，连锁相交直到稳定。
        loop {
            let previous = range;
            for merged in source.merged_ranges() {
                if merged.intersects(range) {
                    range.start.row = range.start.row.min(merged.start.row);
                    range.start.col = range.start.col.min(merged.start.col);
                    range.end.row = range.end.row.max(merged.end.row);
                    range.end.col = range.end.col.max(merged.end.col);
                }
            }
            if range == previous { break; }
        }
        let mut rectangles = Vec::new();
        let matches = |formula: bool| match kind {
            LocateKind::Formulas => formula,
            LocateKind::Constants => !formula,
            // 空白的事件是已有内容，扫描线最后取补集。
            LocateKind::Blanks => true,
        };
        source.for_each_non_empty_in_range(range, |address| {
            if source.merged_range_at(address).is_none() && !source.is_spilled(address)
                && matches(source.has_formula_at(address))
            {
                rectangles.push(CellRange::single(address));
            }
        });
        // 数组子格即使值是 Null 也不是空白；其身份来自原生锚点，不来自显示文字。
        for &anchor in source.spill_anchor_addr.values() {
            if !matches(source.has_formula_at(anchor)) {
                continue;
            }
            if let Some((rows, cols)) = source.spill_info(anchor) {
                if rows > 0 && cols > 0 {
                    rectangles.push(CellRange::new(anchor,
                        CellAddress::new(anchor.row + rows - 1, anchor.col + cols - 1)));
                }
            }
        }
        // 合并格单独保留，不能跟邻格拼接；否则 UI 扩展合并选区时会带入无关格。
        let mut merged_matches = Vec::new();
        // 有内容合并格的覆盖区域不作为空白返回；空合并格仍属于空白。
        // 锚点在查询范围外也要读取其存在性，但不求值、不分配空单元格 atom。
        for merged in source.merges_in_range(range) {
            let mut occupied = false;
            source.for_each_non_empty_in_range(CellRange::single(merged.start), |_| occupied = true);
            if kind == LocateKind::Blanks {
                // 补集先排除所有合并格，最后只补回真正为空的完整合并格。
                rectangles.push(merged);
            }
            if (kind == LocateKind::Blanks && !occupied)
                || (kind != LocateKind::Blanks && occupied && matches(source.has_formula_at(merged.start)))
            {
                merged_matches.push(merged);
            }
        }
        let mut result = pack_rectangles(range, &rectangles, kind == LocateKind::Blanks, region_limit)?;
        if result.ranges.len() + merged_matches.len() > region_limit {
            return Err("Too many separate areas. Select a smaller range and try again.");
        }
        for merged in merged_matches {
            result.cell_count += u64::from(merged.end.row - merged.start.row + 1)
                * u64::from(merged.end.col - merged.start.col + 1);
            result.ranges.push(merged);
        }
        result.ranges.sort_by_key(|r| (r.start.row, r.start.col, r.end.row, r.end.col));
        Ok(result)
    }
}

/// 只在内容矩形起止行切换活动列区间。百万行空表只有两个事件，输出一个矩形。
/// 相邻行带的相同列区间直接续长；超过展示容量就拒绝整个结果，不偷偷截断。
fn pack_rectangles(
    bounds: CellRange,
    rectangles: &[CellRange],
    complement: bool,
    limit: usize,
) -> Result<LocatedCells, &'static str> {
    type Span = (u32, u32);
    let mut events = BTreeMap::<u32, Vec<(Span, bool)>>::new();
    events.entry(bounds.start.row).or_default();
    events.entry(bounds.end.row + 1).or_default();
    for rect in rectangles.iter().filter(|rect| rect.intersects(bounds)) {
        let span = (rect.start.col.max(bounds.start.col), rect.end.col.min(bounds.end.col));
        events.entry(rect.start.row.max(bounds.start.row)).or_default().push((span, true));
        events.entry(rect.end.row.min(bounds.end.row) + 1).or_default().push((span, false));
    }
    let mut active = BTreeMap::<Span, usize>::new();
    let mut events = events.into_iter().peekable();
    let mut last = BTreeMap::<Span, usize>::new();
    let mut result = LocatedCells { scope: bounds, ranges: Vec::new(), cell_count: 0 };
    while let Some((row, changes)) = events.next() {
        for (span, add) in changes {
            if add {
                *active.entry(span).or_default() += 1;
            } else if let Some(count) = active.get_mut(&span) {
                *count -= 1;
                if *count == 0 { active.remove(&span); }
            }
        }
        let Some(&(next_row, _)) = events.peek() else { break };
        let mut spans: Vec<Span> = Vec::new();
        for &(start, end) in active.keys() {
            if let Some(previous) = spans.last_mut() {
                if start <= previous.1 + 1 {
                    previous.1 = previous.1.max(end);
                    continue;
                }
            }
            spans.push((start, end));
        }
        if complement {
            let mut gaps = Vec::new();
            let mut column = bounds.start.col;
            for (start, end) in spans {
                if column < start { gaps.push((column, start - 1)); }
                column = end + 1;
            }
            if column <= bounds.end.col { gaps.push((column, bounds.end.col)); }
            spans = gaps;
        }
        let mut continuing = BTreeMap::new();
        for span in spans {
            result.cell_count += u64::from(next_row - row) * u64::from(span.1 - span.0 + 1);
            let index = if let Some(&index) = last.get(&span) {
                result.ranges[index].end.row = next_row - 1;
                index
            } else {
                if result.ranges.len() >= limit {
                    return Err("Too many separate areas. Select a smaller range and try again.");
                }
                result.ranges.push(CellRange::new(
                    CellAddress::new(row, span.0), CellAddress::new(next_row - 1, span.1)));
                result.ranges.len() - 1
            };
            continuing.insert(span, index);
        }
        last = continuing;
    }
    Ok(result)
}
