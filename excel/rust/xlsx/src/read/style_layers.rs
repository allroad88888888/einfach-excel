//! Preserve supported sparse axis styles without materializing cells.
use crate::native::{CellFormat, IndexedStyle, MAX_COLS, MAX_ROWS};
use super::worksheet::SheetData;

pub fn read(data: &SheetData, xfs: &[CellFormat]) -> (Vec<IndexedStyle>, Vec<IndexedStyle>, usize) {
    let unsupported = data.row_styles.iter().map(|entry| entry.1)
        .chain(data.column_styles.iter().map(|entry| entry.2)).filter(|&style| {
            let Some(format) = xfs.get(style as usize) else { return false };
            let mut remaining = format.clone();
            remaining.fill = None;
            remaining.bg_color = None;
            remaining.font_baseline = None;
            remaining.wrap = None;
            remaining.shrink_to_fit = None;
            if remaining.font_size == data.defaults.font_size { remaining.font_size = None; }
            remaining != CellFormat::default()
        }).count();
    let supported_format = |style: u32| {
        let source = xfs.get(style as usize)?;
        let format = CellFormat { font_baseline: source.font_baseline,
            fill: source.fill.clone(), bg_color: source.bg_color.clone(),
            wrap: source.wrap, shrink_to_fit: source.shrink_to_fit, ..Default::default() };
        (format != CellFormat::default()).then_some(format)
    };
    let rows = data.row_styles.iter().filter_map(|&(index, style)| {
        if index >= MAX_ROWS { return None; }
        Some(IndexedStyle { index, format: supported_format(style)? })
    }).collect();
    let mut columns = std::collections::BTreeMap::new();
    for &(min, max, style) in &data.column_styles {
        let Some(format) = supported_format(style) else { continue };
        for index in min.saturating_sub(1)..max.min(MAX_COLS) {
            columns.insert(index, format.clone());
        }
    }
    (rows, columns.into_iter().map(|(index, format)| IndexedStyle { index, format }).collect(), unsupported)
}
