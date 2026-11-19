//! Apply one stable row permutation to the selected rectangle.

use std::cmp::Ordering;
use std::collections::HashMap;

use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::Sheet;

use super::SortRangeReport;

impl Sheet {
    pub(super) fn apply_sort_order(
        &mut self,
        n: CellRange,
        visible: &[u32],
        mut compare: impl FnMut(usize, usize) -> Ordering,
    ) -> SortRangeReport {
        let mut perm: Vec<usize> = (0..visible.len()).collect();
        perm.sort_by(|&a, &b| compare(a, b));

        // Row map for changed slots only: old row → new (slot) row.
        let mut row_map: HashMap<u32, u32> = HashMap::new();
        let mut row_permutation: Vec<(u32, u32)> = Vec::new();
        for (i, &pi) in perm.iter().enumerate() {
            let slot = visible[i];
            let source = visible[pi];
            if slot != source {
                row_map.insert(source, slot);
                row_permutation.push((slot, source));
            }
        }
        if row_map.is_empty() {
            // Identity permutation: no writes at all.
            return SortRangeReport::default();
        }

        let mut moved_cells: u32 = 0;
        self.for_each_non_empty_in_range(n, |addr| {
            if row_map.contains_key(&addr.row) {
                moved_cells += 1;
            }
        });
        let moved_rows = row_permutation.len() as u32;

        // §6.3: reuse the structural-edit machine (subscription detach,
        // one Store batch, topology epoch bump, per-address change
        // notification), but SKIP the INSTALLED-spill teardown (gate above)
        // and both `retarget_*` steps (verbatim semantics).
        // `relocate_cells` moves values, hydrated ASTs, formula texts,
        // parked sources, and per-cell formats under the row permutation;
        // the map is a bijection so the full-map rebuild cannot collide.
        let (c0, c1) = (n.start.col, n.end.col);
        self.with_structural_edit(move |sheet| {
            // ADR 0006 阶段 0/2 —— 碰撞态 anchor 不在 §5.1 闸门的视野里：闸门
            // 遍历 `spill_anchor_addr`，那是**已安装**投影的索引，而碰撞态
            // anchor 一个 target 都没装。放行是有意的（`is_spill_region` 的
            // 注释写着「collided anchor 必须读 false，好让 sort/fill 有机会挪走
            // 阻塞物」），欠的那一步是搬完之后的收尾：登记表键在**旧**地址，
            // 于是新地址上的数组既不复活，写旧地址还会退掉它的 claim。
            //
            // 收尾就是插删行列那条流水线：整表摘下 → 跟着搬 → 重投影时按新地址
            // 重新登记。摘**整张表**而不只是矩形内的 anchor，因为排序也能在不碰
            // anchor 的情况下腾空（或堵上）它的盒子 —— 空格可置顶或沉底，排序后
            // 清空的格子可能正是别处某个 anchor 的阻塞物。
            let blocked_anchors = sheet.teardown_blocked_spill_anchors();
            let remap = |addr: CellAddress| {
                if addr.col >= c0 && addr.col <= c1 {
                    if let Some(&next) = row_map.get(&addr.row) {
                        return CellAddress::new(next, addr.col);
                    }
                }
                addr
            };
            sheet.relocate_cells(remap);
            // 与 `apply_structural_shift` 同序：先重投影、再剪枝，且喂进去的是
            // **同一个** remap 映射过的地址 —— 两处用不同映射就等于重键错位。
            sheet.rederive_spill_anchors(blocked_anchors.into_iter().map(remap).collect());
            sheet.prune_obsolete_formula_atoms();
        });

        SortRangeReport {
            moved_rows,
            moved_cells,
            row_permutation,
        }
    }
}
