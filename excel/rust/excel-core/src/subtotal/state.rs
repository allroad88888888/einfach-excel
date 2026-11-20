//! Install or restore the outline and ownership of generated subtotal rows.
use super::region::SubtotalRegion;
use crate::outline::{OutlineGroup, SheetOutline, SubtotalOutline};
use crate::Workbook;
use std::cmp::Reverse;
use std::ops::RangeInclusive;

#[derive(Debug)]
pub(super) struct SubtotalState {
    pub(super) regions: Vec<SubtotalRegion>,
    outline: SheetOutline,
}

impl SubtotalState {
    pub(super) fn capture(workbook: &Workbook, sheet: usize) -> Self {
        let sheet = &workbook.sheets[sheet];
        Self {
            regions: sheet.subtotal_regions.clone(),
            outline: sheet.outline.clone(),
        }
    }

    pub(super) fn restore(&self, workbook: &mut Workbook, sheet: usize) {
        workbook
            .set_outline(sheet, self.outline.clone())
            .expect("history holds a validated outline");
        workbook.sheets[sheet]
            .subtotal_regions
            .clone_from(&self.regions);
    }

    pub(super) fn matches(&self, workbook: &Workbook, sheet: usize) -> bool {
        workbook.sheet(sheet).is_some_and(|sheet| {
            sheet.subtotal_regions == self.regions && sheet.outline == self.outline
        })
    }

    pub(super) fn retained_bytes(&self) -> usize {
        crate::sheet::metadata_bytes(self)
    }

    pub(super) fn remove_region(&mut self, id: u32) {
        self.regions.retain(|region| region.id != id);
        self.outline
            .rows
            .retain(|group| group.subtotal.is_none_or(|owner| owner.id != id));
    }

    pub(super) fn with_region(
        mut self,
        region: SubtotalRegion,
        groups: &[RangeInclusive<u32>],
    ) -> Result<Self, &'static str> {
        use super::layout_contract::SubtotalPlacement;
        let owner = SubtotalOutline {
            id: region.id,
            summary_above: region.placement == SubtotalPlacement::Above,
        };
        let previous: Vec<_> = self
            .outline
            .rows
            .iter()
            .filter(|group| group.subtotal == Some(owner))
            .cloned()
            .collect();
        self.remove_region(region.id);
        self.regions.push(region);
        self.outline.rows.extend(groups.iter().map(|rows| {
            let (start, end) = (*rows.start(), *rows.end());
            let collapsed = previous
                .iter()
                .any(|group| group.start == start && group.end == end && group.collapsed);
            OutlineGroup {
                start,
                end,
                collapsed,
                subtotal: Some(owner),
            }
        }));
        self.outline
            .rows
            .sort_by_key(|group| (group.start, Reverse(group.end)));
        self.outline.validate()?;
        Ok(self)
    }
}
