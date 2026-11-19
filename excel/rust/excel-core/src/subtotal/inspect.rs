//! Inspect a subtotal list for field selection without changing workbook state.
use super::region::region_at;
use super::request::SubtotalList;
use crate::{CellRange, Workbook};
use std::collections::BTreeSet;

impl Workbook {
    pub fn inspect_subtotal_list(
        &self,
        sheet: usize,
        selection: CellRange,
        row_count: u32,
        col_count: u32,
    ) -> Result<SubtotalList, &'static str> {
        let regions = self
            .subtotal_regions(sheet)
            .ok_or("The worksheet no longer exists.")?;
        let existing = region_at(regions, selection)?;
        let (range, generated) = match existing {
            Some(region) => (region.source.into(), region.generated_rows()),
            None => (
                self.expand_subtotal_list(sheet, selection.normalize())?,
                BTreeSet::new(),
            ),
        };
        let data = self.read_subtotal_details(sheet, range, &generated, row_count, col_count);
        let (fields, notice) = match data {
            Ok(details) => (details.fields, None),
            Err(error) if existing.is_some() => (Vec::new(), Some(error)),
            Err(error) => return Err(error),
        };
        Ok(SubtotalList {
            range,
            fields,
            notice,
            placement: existing.map(|region| region.placement),
        })
    }

    pub(super) fn expand_subtotal_list(
        &self,
        sheet: usize,
        selection: CellRange,
    ) -> Result<CellRange, &'static str> {
        if selection.start == selection.end {
            self.current_region(sheet, selection.start)
        } else {
            Ok(selection)
        }
    }
}
