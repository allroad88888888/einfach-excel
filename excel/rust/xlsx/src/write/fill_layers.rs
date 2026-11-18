//! Resolve partial cell fill overrides for XLSX's indivisible fill record.
use std::collections::BTreeMap;
use crate::{native::{CellFormat, FormatRange}, report::ReportBuilder};

pub struct FillLayers<'a> {
    rows: BTreeMap<u32, &'a CellFormat>,
    columns: BTreeMap<u32, &'a CellFormat>,
}

impl<'a> FillLayers<'a> {
    pub fn new(range: &'a FormatRange, report: &mut ReportBuilder) -> Self {
        let rows = range.row_styles.iter().map(|entry| (entry.index, &entry.format)).collect();
        let columns = range.column_styles.iter().map(|entry| (entry.index, &entry.format)).collect();
        let result = Self { rows, columns };
        // A partial row style can combine with different column fills. Encoding those
        // intersections would expand sparse styles into cells; report that limitation.
        let column_pattern = result.columns.values().any(|f| f.fill.as_ref().is_some_and(Option::is_some));
        let column_background = result.columns.values().any(|f| f.bg_color.as_ref().is_some_and(Option::is_some));
        let losses = result.rows.values().filter(|f| {
            (f.fill.is_none() && f.bg_color.is_some() && column_pattern)
                || (f.bg_color.is_none() && f.fill.is_some() && column_background)
        }).count();
        report.add("fillInheritance", losses);
        result
    }

    pub fn cell(&self, source: &CellFormat, (row, col): (u32, u32), report: &mut ReportBuilder) -> CellFormat {
        let mut format = source.clone();
        if source.fill.is_none() && source.bg_color.is_none() { return format; }
        let row = self.rows.get(&row);
        let col = self.columns.get(&col);
        let fill = row.and_then(|f| f.fill.as_ref()).or_else(|| col.and_then(|f| f.fill.as_ref()));
        let background = row.and_then(|f| f.bg_color.as_ref()).or_else(|| col.and_then(|f| f.bg_color.as_ref()));
        let inherits_fill = source.fill.is_none() && fill.is_some_and(Option::is_some);
        let inherits_background = source.bg_color.is_none() && background.is_some_and(Option::is_some);
        if inherits_fill || inherits_background {
            // The current appearance is preserved, but changing the lower style after
            // reopening can no longer change this half of the fill independently.
            report.add("fillInheritance", 1);
        }
        format.fill = source.fill.clone().or_else(|| fill.cloned());
        format.bg_color = source.bg_color.clone().or_else(|| background.cloned());
        format
    }
}
