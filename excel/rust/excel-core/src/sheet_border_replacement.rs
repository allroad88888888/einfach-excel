//! 完整格式替换的共边计划：源内冲突按可见线型归并，源外邻格服从本次写入。
use super::borders::{adjacent, border_side, BorderPlan};
use super::*;
use crate::{BorderSpec, BorderStyle, CellBorders};

impl Sheet {
    /// 合并几何是当前事务完成后的几何；只用于这次计算，不保存第二份工作簿状态。
    pub(crate) fn plan_replacement_borders(
        &self,
        replacements: impl IntoIterator<Item = (CellAddress, CellBorders)>,
        merges: &[CellRange],
    ) -> BorderPlan {
        let mut desired: BorderPlan = replacements.into_iter().collect();
        let written: HashSet<_> = desired.keys().copied().collect();
        // 一个逻辑格的格式粘到已有合并格时，四条边覆盖整个逻辑格，而非锚点小格。
        for merge in merges {
            if desired.contains_key(&merge.start) {
                for col in merge.start.col..=merge.end.col {
                    desired
                        .entry(CellAddress::new(merge.start.row, col))
                        .or_default();
                    desired
                        .entry(CellAddress::new(merge.end.row, col))
                        .or_default();
                }
                for row in merge.start.row..=merge.end.row {
                    desired
                        .entry(CellAddress::new(row, merge.start.col))
                        .or_default();
                    desired
                        .entry(CellAddress::new(row, merge.end.col))
                        .or_default();
                }
            }
        }
        let mut writes = desired.clone();
        let mut addresses: Vec<_> = desired.keys().copied().collect();
        addresses.sort_unstable_by_key(|addr| (addr.row, addr.col));
        for addr in addresses {
            for side in 0..4 {
                if !is_perimeter(merges, addr, side) {
                    continue;
                }
                let source = replacement_edge(&desired, merges, addr, side);
                let neighbour = adjacent(addr, side);
                let opposite = (side + 2) % 4;
                let peer = neighbour
                    .filter(|addr| desired.contains_key(addr))
                    .and_then(|addr| replacement_edge(&desired, merges, addr, opposite));
                // 同次复制内部两面保留源的可见线；不让目标原来的粗线压住新的细线。
                let chosen = if side == 0 || side == 3 {
                    shared(peer, source)
                } else {
                    shared(source, peer)
                }
                .cloned()
                .unwrap_or_default();
                self.plan_border_side(&mut writes, addr, side, &chosen);
                if let Some(neighbour) = neighbour {
                    self.plan_border_side(&mut writes, neighbour, opposite, &chosen);
                }
            }
        }
        writes.retain(|addr, borders| {
            // 普通格式已写入的格比较其新格式，额外外沿／邻格比较其原格式。
            let after_format = if written.contains(addr) {
                desired[addr].clone()
            } else {
                self.base_format_at(*addr).borders
            };
            *borders != after_format
        });
        writes
    }
}

fn is_perimeter(merges: &[CellRange], addr: CellAddress, side: usize) -> bool {
    merges
        .iter()
        .find(|m| m.contains(addr))
        .is_none_or(|m| match side {
            0 => addr.row == m.start.row,
            1 => addr.col == m.end.col,
            2 => addr.row == m.end.row,
            _ => addr.col == m.start.col,
        })
}

fn replacement_edge<'a>(
    desired: &'a BorderPlan,
    merges: &[CellRange],
    addr: CellAddress,
    side: usize,
) -> Option<&'a BorderSpec> {
    if !is_perimeter(merges, addr, side) {
        return None;
    }
    border_side(desired.get(&addr)?, side).or_else(|| {
        let merge = merges.iter().find(|m| m.contains(addr))?;
        border_side(desired.get(&merge.start)?, side)
    })
}

fn shared<'a>(a: Option<&'a BorderSpec>, b: Option<&'a BorderSpec>) -> Option<&'a BorderSpec> {
    fn weight(style: BorderStyle) -> u8 {
        match style {
            BorderStyle::None => 100,
            BorderStyle::Thin => 10,
            BorderStyle::Dotted => 8,
            BorderStyle::Dashed => 9,
            BorderStyle::Medium => 20,
            BorderStyle::Thick => 30,
            BorderStyle::Double => 31,
        }
    }
    match (a, b) {
        (Some(a), Some(b)) if weight(b.style) > weight(a.style) => Some(b),
        (Some(a), _) => Some(a),
        (_, b) => b,
    }
}
