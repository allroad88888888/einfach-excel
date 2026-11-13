//! Preserve explicitly declared row/column baseline layers without materializing default normal.
use crate::native::{CellFormat, IndexedStyle, MAX_COLS, MAX_ROWS};
use super::worksheet::SheetData;

pub fn read(data: &SheetData, xfs: &[CellFormat]) -> (Vec<IndexedStyle>, Vec<IndexedStyle>, usize) {
    let unsupported = data.row_styles.iter().map(|entry| entry.1)
        .chain(data.column_styles.iter().map(|entry| entry.2)).filter(|&style| {
            let Some(format) = xfs.get(style as usize) else { return false };
            let mut remaining = format.clone();
            remaining.font_baseline = None;
            if remaining.font_size == data.defaults.font_size { remaining.font_size = None; }
            remaining != CellFormat::default()
        }).count();
    let baseline = |style: u32| xfs.get(style as usize)?.font_baseline;
    let rows = data.row_styles.iter().filter_map(|&(index, style)| {
        if index >= MAX_ROWS { return None; }
        Some(IndexedStyle { index, format: CellFormat {
            font_baseline: Some(baseline(style)?), ..Default::default()
        } })
    }).collect();
    let mut columns = std::collections::BTreeMap::new();
    for &(min, max, style) in &data.column_styles {
        let Some(font_baseline) = baseline(style) else { continue };
        for index in min.saturating_sub(1)..max.min(MAX_COLS) {
            columns.insert(index, CellFormat { font_baseline: Some(font_baseline), ..Default::default() });
        }
    }
    (rows, columns.into_iter().map(|(index, format)| IndexedStyle { index, format }).collect(), unsupported)
}
