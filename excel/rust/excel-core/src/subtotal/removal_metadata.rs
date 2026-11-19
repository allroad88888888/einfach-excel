//! Keep user-owned worksheet metadata whose only rows would disappear.
use super::region::SubtotalRegion;
use crate::Workbook;

impl Workbook {
    pub(super) fn validate_subtotal_metadata_removal(
        &self,
        sheet: usize,
        region: &SubtotalRegion,
    ) -> Result<(), &'static str> {
        let source = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        let generated = region.generated_rows();
        let removes_rows =
            |start: u32, end: u32| generated.range(start..=end).count() as u32 == end - start + 1;
        let removes_range = |range: crate::CellRange| removes_rows(range.start.row, range.end.row);
        if source
            .data_validations()
            .iter()
            .any(|entry| removes_range(entry.range))
        {
            return Err("Removing these subtotal rows would delete a data validation rule.");
        }
        let formats = self
            .conditional_format_config(sheet)
            .map_err(|_| "The worksheet no longer exists.")?;
        if formats.rules.iter().any(|rule| {
            removes_rows(rule.row_start, rule.row_end)
                && rule.additional_ranges.iter().copied().all(removes_range)
        }) {
            return Err("Removing these subtotal rows would delete a conditional formatting rule.");
        }
        let removes_group = source.outline().rows.iter().any(|group| {
            group.subtotal.is_none_or(|owner| owner.id != region.id)
                && removes_rows(group.start, group.end)
        });
        let removes_visibility = self
            .list_hidden_rows(sheet)
            .iter()
            .any(|row| generated.contains(row));
        let removes_editable_range = self
            .read_protection(sheet)?
            .unlocked_ranges
            .iter()
            .any(|range| removes_rows(range.row_start, range.row_end));
        let removes_filter = self.filter_range(sheet).is_some_and(removes_range);
        if removes_group || removes_visibility || removes_editable_range || removes_filter {
            return Err(
                "Removing these subtotal rows would delete independent worksheet settings.",
            );
        }
        Ok(())
    }
}
