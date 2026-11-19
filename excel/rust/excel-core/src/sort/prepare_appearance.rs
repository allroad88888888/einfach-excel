//! Materialize visual matches from the displayed format window before changing row order.

use std::collections::BTreeMap;

use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::collapse_array_for_eval;
use crate::workbook::Workbook;

use super::appearance_key::SortAppearanceKey;
use super::color_key::SortColorSource;
use super::display_colors::effective_color;
use super::SortRangeError;

const DISPLAY_WINDOW_ROWS: u32 = 100_000;

impl Workbook {
    pub(super) fn prepare_sort_appearance(
        &self,
        sheet: usize,
        rows: &[u32],
        keys: &[SortAppearanceKey],
    ) -> Result<Vec<Vec<bool>>, SortRangeError> {
        let target = self.sheet(sheet).ok_or(SortRangeError::InvalidRange)?;
        let mut groups: BTreeMap<u32, Vec<(usize, SortAppearanceKey)>> = BTreeMap::new();
        for (i, key) in keys.iter().copied().enumerate() {
            groups.entry(key.column()).or_default().push((i, key));
        }
        let mut matches: Vec<_> = keys.iter().map(|_| Vec::with_capacity(rows.len())).collect();
        let today = crate::calendar_period::local_today_serial();

        for (col, levels) in groups {
            let mut remaining = rows;
            while let Some(&first) = remaining.first() {
                let count = remaining.partition_point(|row| *row - first < DISPLAY_WINDOW_ROWS);
                let (included, tail) = remaining.split_at(count);
                let last = included[count - 1];
                let range = CellRange::new(CellAddress::new(first, col), CellAddress::new(last, col));
                let display = self.snapshot_display_format_range_on(sheet, range, today)
                    .map_err(|_| SortRangeError::InvalidRange)?;
                let snapshot = &display.formats;

                let column = snapshot.column_styles.first().map(|(_, style)| style);
                for &row in included {
                    let addr = CellAddress::new(row, col);
                    let underlying = snapshot.row_styles.binary_search_by_key(&row, |(i, _)| *i)
                        .ok().map(|i| &snapshot.row_styles[i].1.format);
                    let cell = snapshot.cell_styles.binary_search_by_key(&row, |(a, _)| a.row)
                        .ok().map(|i| &snapshot.cell_styles[i].1);
                    let layers = [cell, underlying, column];
                    let conditional_font = display.conditional_font_colors
                        .binary_search_by_key(&row, |a| a.row).is_ok();
                    let mut fill = None;
                    let mut font = None;
                    let mut icon = None;
                    for &(index, key) in &levels {
                        let matched = match key {
                            SortAppearanceKey::Color(key) => {
                                let fact = match key.source {
                                    SortColorSource::Fill => &mut fill,
                                    SortColorSource::Font => &mut font,
                                }.get_or_insert_with(|| effective_color(layers, key.source, conditional_font,
                                    || collapse_array_for_eval(target.peek_value(addr))));
                                key.matches(*fact)
                            }
                            SortAppearanceKey::Icon(key) => {
                                let fact = icon.get_or_insert_with(|| display.conditional_icons
                                    .binary_search_by_key(&row, |(pos, _)| pos.row).ok()
                                    .map(|i| &display.conditional_icons[i].1));
                                key.matches(*fact)
                            }
                        };
                        matches[index].push(matched);
                    }
                }
                remaining = tail;
            }
        }
        target.store.settle_pending_reads();
        Ok(matches)
    }
}
