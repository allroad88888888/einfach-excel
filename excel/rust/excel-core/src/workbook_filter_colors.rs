//! Page the distinct displayed colors of rows available to a filter.

use super::*;
use crate::display_color::{DisplayColor, DisplayColorSource};
use crate::filter::display_column::FilterDisplayColumn;
use crate::filter::scan_day::FilterScanDay;

impl Workbook {
    pub fn filter_colors(
        &self,
        sheet: usize,
        query: FilterValuesQuery<'_>,
        source: DisplayColorSource,
    ) -> Result<FilterValuesPage, String> {
        self.validate_filter_values_query(sheet, &query)?;
        let day = FilterScanDay::default();
        let Some((data, excluded)) = self.filter_candidate_scope(sheet, query.column, query.table, &day)?
        else { return Ok(FilterValuesPage::default()); };
        let range = CellRange::new(
            CellAddress::new(data.start.row, query.column),
            CellAddress::new(data.end.row, query.column),
        );
        let display = self.snapshot_display_format_range_on(sheet, range, day.today())?;
        let target = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        let column = FilterDisplayColumn::new(target, &display);
        let mut counts = BTreeMap::<DisplayColor, u32>::new();
        let mut row_colors = Vec::new();
        for row in (data.start.row..=data.end.row).filter(|row| !excluded.contains(row)) {
            column.visit_colors(row, source, |color| {
                if color != DisplayColor::Other { row_colors.push(color); }
            });
            row_colors.sort_unstable();
            row_colors.dedup();
            for color in row_colors.drain(..) {
                *counts.entry(color).or_default() += 1;
            }
            if counts.len() > crate::filter::MAX_FILTER_PREDICATE_CELLS as usize {
                self.store.settle_pending_reads();
                return Err("Too many filter colors to browse. Enter the RGB color directly.".into());
            }
        }
        self.store.settle_pending_reads();
        let search = query.search.to_ascii_lowercase();
        let values = counts.into_iter().filter_map(|(color, count)| {
            let value = color.selection_value()?;
            value.contains(&search).then_some(FilterValueEntry { value, count })
        }).collect::<Vec<_>>();
        let total = values.len() as u32;
        let offset = query.offset.min(total);
        let values = values.into_iter().skip(offset as usize).take(query.limit as usize).collect();
        Ok(FilterValuesPage { values, total, offset })
    }
}
