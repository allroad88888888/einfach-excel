//! Export supported sparse axis text formats; unrelated losses retain their existing report.
use crate::native::{CellFormat, FormatRange, MAX_COLS, MAX_ROWS};
use super::{styles::StyleTable, worksheet::SheetInput};

pub fn write(range: &FormatRange, sheet: &mut SheetInput, styles: &mut StyleTable) {
    for (entries, target, limit) in [
        (&range.row_styles, &mut sheet.row_styles, MAX_ROWS),
        (&range.column_styles, &mut sheet.column_styles, MAX_COLS),
    ] {
        for entry in entries {
            if entry.index >= limit { continue; }
            let source = &entry.format;
            if source.font_baseline.is_none() && source.wrap.is_none() && source.shrink_to_fit.is_none() {
                continue;
            }
            let format = CellFormat {
                font_baseline: source.font_baseline,
                wrap: source.wrap,
                shrink_to_fit: source.shrink_to_fit,
                font_size: sheet.defaults.font_size,
                ..Default::default()
            };
            target.insert(entry.index, styles.xf(&format));
        }
    }
}
