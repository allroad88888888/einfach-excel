//! Only baseline is newly supported on row/column layers; other losses keep their existing report.
use crate::native::{CellFormat, FormatRange, MAX_COLS, MAX_ROWS};
use super::{styles::StyleTable, worksheet::SheetInput};

pub fn write(range: &FormatRange, sheet: &mut SheetInput, styles: &mut StyleTable) {
    for (entries, target, limit) in [
        (&range.row_styles, &mut sheet.row_styles, MAX_ROWS),
        (&range.column_styles, &mut sheet.column_styles, MAX_COLS),
    ] {
        for entry in entries {
            if entry.index >= limit { continue; }
            let Some(font_baseline) = entry.format.font_baseline else { continue };
            let format = CellFormat {
                font_baseline: Some(font_baseline),
                font_size: sheet.defaults.font_size,
                ..Default::default()
            };
            target.insert(entry.index, styles.xf(&format));
        }
    }
}
