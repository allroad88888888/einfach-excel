//! 在选区内部压紧保留行；复用结构搬移，不改变范围外单元格或行列属性。
use super::*;

impl Sheet {
    pub(crate) fn compact_duplicate_rows(&mut self, range: CellRange, slots: &[u32], kept: &[u32]) {
        let survivors: HashSet<_> = kept.iter().copied().collect();
        let deleted: HashSet<_> = slots.iter().copied().filter(|row| !survivors.contains(row)).collect();
        let moves: HashMap<_, _> = kept.iter().copied().zip(slots.iter().copied()).collect();
        self.with_structural_edit(|sheet| {
            let blocked = sheet.teardown_blocked_spill_anchors();
            let removed = |addr: CellAddress| range.contains(addr) && deleted.contains(&addr.row);
            sheet.drop_cells_in(removed);
            let remap = |addr: CellAddress| {
                if range.contains(addr) {
                    if let Some(&row) = moves.get(&addr.row) { return CellAddress::new(row, addr.col); }
                }
                addr
            };
            // 公式文本和 cellStyle 随记录移动；与现有排序一致，不翻译公式引用。
            sheet.relocate_cells(remap);
            sheet.rederive_spill_anchors(blocked.into_iter().filter(|addr| !removed(*addr)).map(remap).collect());
            sheet.prune_obsolete_formula_atoms();
        });
    }
}
