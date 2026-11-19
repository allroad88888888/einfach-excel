//! Indexed appearance matches for a single filter scan.

use std::collections::{BTreeMap, HashMap};
use std::ops::RangeInclusive;

use crate::advanced_filter::FilterCriteria;
use crate::display_color::DisplayColorSource;
use crate::filter::{ColumnFilterRule, FilterColorTarget, FilterError};
use crate::{CellAddress, CellRange, Workbook};

use super::display_column::FilterDisplayColumn;

type Key = (DisplayColorSource, FilterColorTarget);

#[derive(Default)]
pub(crate) struct PreparedColors {
    start: u32,
    matches: HashMap<(u32, Key), Vec<bool>>,
}

impl PreparedColors {
    pub(crate) fn scan(
        workbook: &Workbook,
        sheet: usize,
        rows: RangeInclusive<u32>,
        criteria: FilterCriteria<'_>,
        today: Option<f64>,
    ) -> Result<Self, FilterError> {
        let mut facts = Self { start: *rows.start(), matches: HashMap::new() };
        if rows.is_empty() { return Ok(facts); }
        let count = (*rows.end() - *rows.start() + 1) as usize;
        let mut columns: BTreeMap<u32, HashMap<Key, Vec<bool>>> = BTreeMap::new();
        for rule in criteria.rules() {
            if let ColumnFilterRule::Color { col_index, source, color } = *rule {
                columns.entry(col_index).or_default().entry((source, color))
                    .or_insert_with(|| vec![false; count]);
            }
        }
        let target = workbook.sheet(sheet).ok_or(FilterError::InvalidSheet)?;
        for (column, mut keys) in columns {
            let range = CellRange::new(
                CellAddress::new(*rows.start(), column), CellAddress::new(*rows.end(), column),
            );
            let snapshot = workbook.snapshot_display_format_range_on(sheet, range, today)
                .map_err(|_| FilterError::InvalidRange)?;
            let display = FilterDisplayColumn::new(target, &snapshot);
            for source in [DisplayColorSource::Fill, DisplayColorSource::Font] {
                let mut pending: Vec<_> = keys.iter_mut()
                    .filter_map(|((kind, target), matches)| (*kind == source).then_some((*target, matches)))
                    .collect();
                if pending.is_empty() { continue; }
                for (index, row) in rows.clone().enumerate() {
                    display.visit_colors(row, source, |color| {
                        for (target, matches) in &mut pending {
                            matches[index] |= target.matches(color);
                        }
                    });
                }
            }
            facts.matches.extend(keys.into_iter().map(|(key, values)| ((column, key), values)));
        }
        Ok(facts)
    }

    pub(crate) fn matches(
        &self,
        row: u32,
        column: u32,
        source: DisplayColorSource,
        color: FilterColorTarget,
    ) -> bool {
        self.matches.get(&(column, (source, color)))
            .and_then(|matches| matches.get(row.checked_sub(self.start)? as usize))
            .copied().unwrap_or(false)
    }
}
