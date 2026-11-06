//! 数据区域 → 逐系列公式（导入 join 的逆运算）：把多块区域拼成虚拟表，
//! 再把虚拟表里的系列名 / 类别 / 值条映射回真实单元格。纯函数，不碰 XML。

use super::formula::{formula, Piece};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesRefs {
    pub name: Option<String>,
    pub cat: Option<String>,
    pub val: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Join {
    /// 各块行数相同，左右拼接。
    Side,
    /// 各块列数相同，上下拼接。
    Stack,
}

struct Table<'a> {
    blocks: &'a [Piece],
    join: Join,
    transposed: bool,
}

fn rows(block: &Piece) -> u32 { block.end_row - block.start_row + 1 }
fn cols(block: &Piece) -> u32 { block.end_col - block.start_col + 1 }

fn join_of(blocks: &[Piece]) -> Option<Join> {
    let first = blocks.first()?;
    if blocks.iter().all(|b| rows(b) == rows(first)) { Some(Join::Side) }
    else if blocks.iter().all(|b| cols(b) == cols(first)) { Some(Join::Stack) }
    else { None }
}

impl Table<'_> {
    /// 逻辑表（已按 series_in 转置）尺寸 (行, 列)。
    fn size(&self) -> (u32, u32) {
        let (r, c) = match self.join {
            Join::Side => (rows(&self.blocks[0]), self.blocks.iter().map(cols).sum()),
            Join::Stack => (self.blocks.iter().map(rows).sum(), cols(&self.blocks[0])),
        };
        if self.transposed { (c, r) } else { (r, c) }
    }

    /// 逻辑表里的矩形（含两端）→ 真实单元格块；跨块时按块切成多段。
    fn pieces(&self, r1: u32, r2: u32, c1: u32, c2: u32) -> Vec<Piece> {
        let (r1, r2, c1, c2) = if self.transposed { (c1, c2, r1, r2) } else { (r1, r2, c1, c2) };
        let side = self.join == Join::Side;
        let (lo, hi) = if side { (c1, c2) } else { (r1, r2) };
        let mut out = Vec::new();
        let mut start = 0;
        for block in self.blocks {
            let span = if side { cols(block) } else { rows(block) };
            let (from, to) = (lo.max(start), hi.min(start + span - 1));
            if from <= to {
                let (local_from, local_to) = (from - start, to - start);
                let (rs, re, cs, ce) = if side { (r1, r2, local_from, local_to) } else { (local_from, local_to, c1, c2) };
                out.push(Piece {
                    sheet: block.sheet.clone(),
                    start_row: block.start_row + rs,
                    end_row: block.start_row + re,
                    start_col: block.start_col + cs,
                    end_col: block.start_col + ce,
                });
            }
            start += span;
        }
        out
    }
}

/// `blocks` 是带表名的各个数据区域，顺序同 `refs`。无法拼成表或没有数据返回 None。
pub fn split(blocks: &[Piece], series_in_rows: bool, header_row: bool, header_col: bool) -> Option<Vec<SeriesRefs>> {
    let table = Table { blocks, join: join_of(blocks)?, transposed: series_in_rows };
    let (height, width) = table.size();
    let (first_row, first_col) = (u32::from(header_row), u32::from(header_col));
    if height <= first_row || width <= first_col { return None; }
    let cat = if header_col { formula(&table.pieces(first_row, height - 1, 0, 0)) } else { None };
    let series = (first_col..width).filter_map(|col| {
        let val = formula(&table.pieces(first_row, height - 1, col, col))?;
        let name = if header_row { formula(&table.pieces(0, 0, col, col)) } else { None };
        Some(SeriesRefs { name, cat: cat.clone(), val })
    });
    Some(series.collect())
}

#[cfg(test)]
#[path = "series_tests.rs"]
mod tests;
