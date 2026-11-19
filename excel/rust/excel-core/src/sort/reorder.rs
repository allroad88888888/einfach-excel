//! Apply one stable permutation to the selected rectangle.

use std::cmp::Ordering;
use std::collections::HashMap;

use crate::{CellAddress, CellRange, Sheet};

use super::axis::SortAxis;
use super::SortRangeReport;

#[derive(Default)]
pub(super) struct SlotPermutation {
    pub(super) moved_cells: u32,
    pub(super) changed_slots: Vec<(u32, u32)>,
}

impl Sheet {
    pub(super) fn apply_sort_order(
        &mut self,
        range: CellRange,
        slots: &[u32],
        compare: impl FnMut(usize, usize) -> Ordering,
    ) -> SortRangeReport {
        let result = self.apply_slot_permutation(range, slots, SortAxis::Rows, compare);
        SortRangeReport {
            moved_rows: result.changed_slots.len() as u32,
            moved_cells: result.moved_cells,
            row_permutation: result.changed_slots,
        }
    }

    pub(super) fn apply_slot_permutation(
        &mut self,
        range: CellRange,
        slots: &[u32],
        axis: SortAxis,
        mut compare: impl FnMut(usize, usize) -> Ordering,
    ) -> SlotPermutation {
        let mut sorted: Vec<usize> = (0..slots.len()).collect();
        sorted.sort_by(|&left, &right| compare(left, right));

        let changed_slots: Vec<_> = slots.iter().copied()
            .zip(sorted.into_iter().map(|index| slots[index]))
            .filter(|(slot, source)| slot != source).collect();
        if changed_slots.is_empty() {
            return SlotPermutation::default();
        }

        let destinations: HashMap<_, _> =
            changed_slots.iter().map(|&(slot, source)| (source, slot)).collect();
        let mut moved_cells = 0;
        self.for_each_non_empty_in_range(range, |address| {
            if destinations.contains_key(&axis.slot(address)) {
                moved_cells += 1;
            }
        });

        let keys = axis.keys(range);
        self.with_structural_edit(move |sheet| {
            // A blocked spill can change even when its anchor is outside the
            // rectangle. Rebuild its claim after relocating the obstruction.
            let blocked = sheet.teardown_blocked_spill_anchors();
            let remap = |address: CellAddress| {
                let key = axis.key(address);
                if keys.contains(&key) {
                    if let Some(&slot) = destinations.get(&axis.slot(address)) {
                        return axis.address(slot, key);
                    }
                }
                address
            };
            sheet.relocate_cells(remap);
            // Both cells and parked anchors must use the same coordinate map.
            sheet.rederive_spill_anchors(blocked.into_iter().map(remap).collect());
            sheet.prune_obsolete_formula_atoms();
        });

        SlotPermutation { moved_cells, changed_slots }
    }
}
