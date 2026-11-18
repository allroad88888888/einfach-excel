//! Diagonals belong to one logical cell; they never synchronize adjacent physical edges.
use super::borders::{BorderPlan, BorderPreset};
use super::*;
use crate::{BorderSpec, BorderStyle};

impl Sheet {
    pub(super) fn plan_diagonal_borders(
        &self,
        range: CellRange,
        preset: BorderPreset,
        border: &BorderSpec,
    ) -> BorderPlan {
        let mut writes = BorderPlan::new();
        for addr in range.iter() {
            if self.merged_range_at(addr).is_some_and(|merge| merge.start != addr) {
                continue;
            }
            let before = self.base_format_at(addr).borders;
            let mut after = before.clone();
            for (target, enabled) in [
                (&mut after.diag_up, matches!(preset, BorderPreset::DiagonalUp | BorderPreset::Diagonal)),
                (&mut after.diag_down, matches!(preset, BorderPreset::DiagonalDown | BorderPreset::Diagonal)),
            ] {
                if enabled {
                    *target = Some(border.clone());
                } else if target.as_ref().is_some_and(|spec| spec.style != BorderStyle::None) {
                    *target = Some(BorderSpec::default());
                }
            }
            if before != after {
                writes.insert(addr, after);
            }
        }
        writes
    }
}
