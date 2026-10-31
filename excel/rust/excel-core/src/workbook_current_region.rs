//! “当前区域”：从活动格向外扩到被空行、空列包围的连续内容块（Ctrl+Shift+*）。
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{CellAddress, CellRange, Sheet, Workbook};

fn union(a: CellRange, b: CellRange) -> CellRange {
    CellRange::new(
        CellAddress::new(a.start.row.min(b.start.row), a.start.col.min(b.start.col)),
        CellAddress::new(a.end.row.max(b.end.row), a.end.col.max(b.end.col)),
    )
}

/// 溢出区与有内容的合并格是整块内容；子格不在稀疏索引里，必须按整块并入。
fn whole_blocks(sheet: &Sheet, active: CellAddress) -> Vec<CellRange> {
    let mut blocks = Vec::new();
    for &anchor in sheet.spill_anchor_addr.values() {
        if let Some((rows, cols)) = sheet.spill_info(anchor) {
            if rows > 0 && cols > 0 {
                blocks.push(CellRange::new(
                    anchor,
                    CellAddress::new(anchor.row + rows - 1, anchor.col + cols - 1),
                ));
            }
        }
    }
    for merged in sheet.merged_ranges() {
        let mut occupied = merged.contains(active);
        sheet.for_each_non_empty_in_range(CellRange::single(merged.start), |_| occupied = true);
        if occupied {
            blocks.push(*merged);
        }
    }
    blocks
}

/// 条带内有任何内容就返回其包围盒；只读稀疏索引，不展开空格。
fn strip_hits(sheet: &Sheet, strip: CellRange) -> Option<CellRange> {
    let mut found: Option<CellRange> = None;
    sheet.for_each_non_empty_in_range(strip, |addr| {
        let cell = CellRange::single(addr);
        found = Some(found.map_or(cell, |old| union(old, cell)));
    });
    found
}

impl Workbook {
    /// 依据真实工作簿数据，不依赖视口；合并格与溢出区作为整块参与扩展。
    pub fn current_region(&self, sheet: usize, active: CellAddress) -> Result<CellRange, &'static str> {
        let source = self.sheet(sheet).ok_or("Invalid select-special worksheet.")?;
        if active.row >= EXCEL_MAX_ROWS || active.col >= EXCEL_MAX_COLS {
            return Err("Invalid select-special cell.");
        }
        let blocks = whole_blocks(source, active);
        let wrap = |mut rect: CellRange| loop {
            let ring = CellRange::new(
                CellAddress::new(rect.start.row.saturating_sub(1), rect.start.col.saturating_sub(1)),
                CellAddress::new(
                    (rect.end.row + 1).min(EXCEL_MAX_ROWS - 1),
                    (rect.end.col + 1).min(EXCEL_MAX_COLS - 1),
                ),
            );
            let next = blocks.iter().filter(|b| b.intersects(ring)).fold(rect, |acc, b| union(acc, *b));
            if next == rect {
                return rect;
            }
            rect = next;
        };
        let mut rect = wrap(CellRange::single(active));
        loop {
            let previous = rect;
            // 先沿行方向走：一条行带一次查询，长数据列不会反复重扫整块。
            loop {
                let mut moved = false;
                let (c0, c1) = (rect.start.col.saturating_sub(1), (rect.end.col + 1).min(EXCEL_MAX_COLS - 1));
                if let Some(row) = rect.start.row.checked_sub(1) {
                    if let Some(hit) = strip_hits(source, CellRange::new(CellAddress::new(row, c0), CellAddress::new(row, c1))) {
                        rect = wrap(union(union(rect, hit), CellRange::single(CellAddress::new(row, rect.start.col))));
                        moved = true;
                    }
                }
                let row = rect.end.row + 1;
                if row < EXCEL_MAX_ROWS {
                    if let Some(hit) = strip_hits(source, CellRange::new(CellAddress::new(row, c0), CellAddress::new(row, c1))) {
                        rect = wrap(union(union(rect, hit), CellRange::single(CellAddress::new(row, rect.end.col))));
                        moved = true;
                    }
                }
                if !moved {
                    break;
                }
            }
            let (r0, r1) = (rect.start.row.saturating_sub(1), (rect.end.row + 1).min(EXCEL_MAX_ROWS - 1));
            if let Some(col) = rect.start.col.checked_sub(1) {
                if let Some(hit) = strip_hits(source, CellRange::new(CellAddress::new(r0, col), CellAddress::new(r1, col))) {
                    rect = wrap(union(union(rect, hit), CellRange::single(CellAddress::new(rect.start.row, col))));
                }
            }
            let col = rect.end.col + 1;
            if col < EXCEL_MAX_COLS {
                if let Some(hit) = strip_hits(source, CellRange::new(CellAddress::new(r0, col), CellAddress::new(r1, col))) {
                    rect = wrap(union(union(rect, hit), CellRange::single(CellAddress::new(rect.end.row, col))));
                }
            }
            if rect == previous {
                return Ok(rect);
            }
        }
    }
}
