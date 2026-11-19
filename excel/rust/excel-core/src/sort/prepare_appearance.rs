//! Materialize displayed matches before moving the selected records.

use std::collections::BTreeMap;

use crate::display_color::effective_color;
use crate::display_formats::DisplayFormats;
use crate::sheet::collapse_array_for_eval;
use crate::{CellRange, Workbook};

use super::appearance_key::SortAppearanceKey;
use super::axis::SortAxis;
use super::{SortColorSource, SortRangeError};

const MAX_DISPLAY_WINDOW_SLOTS: u32 = 100_000;

impl Workbook {
    pub(super) fn prepare_sort_appearance(
        &self,
        sheet: usize,
        axis: SortAxis,
        slots: &[u32],
        keys: &[(u32, SortAppearanceKey)],
    ) -> Result<Vec<Vec<bool>>, SortRangeError> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }
        let target = self.sheet(sheet).ok_or(SortRangeError::InvalidRange)?;
        let mut levels: BTreeMap<u32, Vec<(usize, SortAppearanceKey)>> = BTreeMap::new();
        for (index, (coordinate, key)) in keys.iter().copied().enumerate() {
            levels.entry(coordinate).or_default().push((index, key));
        }
        let mut matches: Vec<_> = keys.iter().map(|_| Vec::with_capacity(slots.len())).collect();
        let today = crate::calendar_period::local_today_serial();

        for (coordinate, group) in levels {
            let mut remaining = slots;
            while let Some(&first) = remaining.first() {
                let count = remaining.partition_point(|slot| *slot - first < MAX_DISPLAY_WINDOW_SLOTS);
                let (included, tail) = remaining.split_at(count);
                let last = included[count - 1];
                let range = CellRange::new(axis.address(first, coordinate), axis.address(last, coordinate));
                let snapshot = self.snapshot_display_format_range_on(sheet, range, today)
                    .map_err(|_| SortRangeError::InvalidRange)?;
                let display = DisplayFormats::new(&snapshot);
                for &slot in included {
                    let address = axis.address(slot, coordinate);
                    let layers = display.layers_at(address);
                    let conditional_font = display.has_conditional_font_at(address);
                    let mut fill = None;
                    let mut font = None;
                    let mut icon = None;
                    for &(index, key) in &group {
                        let matched = match key {
                            SortAppearanceKey::Color(key) => {
                                let value = match key.source {
                                    SortColorSource::Fill => &mut fill,
                                    SortColorSource::Font => &mut font,
                                }.get_or_insert_with(|| effective_color(
                                    layers, key.source, conditional_font,
                                    || collapse_array_for_eval(target.peek_value(address)),
                                ));
                                key.matches(*value)
                            }
                            SortAppearanceKey::Icon(key) => {
                                let value = icon.get_or_insert_with(|| display.icon_at(address));
                                key.matches(*value)
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
