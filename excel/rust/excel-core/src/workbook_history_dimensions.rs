//! 格子事务只回放本次真实改变的轴尺寸；显式尺寸权限来自原生 writer generation。
use super::*;
use std::collections::{BTreeMap, BTreeSet};

type Parts = [(usize, HistorySnapshot)];

#[derive(Debug)]
struct AxisChange {
    sheet: usize,
    index: u32,
    before: Option<u32>,
    after: Option<u32>,
    explicit: bool,
}

#[derive(Debug, Default)]
pub(super) struct CellDimensionChanges {
    rows: Vec<AxisChange>,
    columns: Vec<AxisChange>,
}

impl CellDimensionChanges {
    pub(super) fn capture(
        book: &Workbook,
        before: &Parts,
        after: &Parts,
        generations: &BTreeMap<usize, [u64; 2]>,
    ) -> Self {
        let mut result = Self::default();
        for rows in [true, false] {
            let mut keys = BTreeSet::new();
            for (sheet, snapshot) in before.iter().chain(after) {
                if rows {
                    keys.extend(
                        snapshot
                            .formats
                            .row_styles
                            .iter()
                            .filter_map(|(index, style)| style.height.map(|_| (*sheet, *index))),
                    );
                } else {
                    keys.extend(
                        snapshot
                            .column_widths
                            .iter()
                            .map(|(index, _)| (*sheet, *index)),
                    );
                }
            }
            for (sheet, index) in keys {
                let old = captured_size(before, sheet, index, rows);
                let new = captured_size(after, sheet, index, rows);
                if old == new {
                    continue;
                }
                let axis = usize::from(!rows);
                let explicit = generations.get(&sheet).is_none_or(|initial| {
                    book.sheet(sheet).unwrap().dimension_generations()[axis] != initial[axis]
                });
                let change = AxisChange {
                    sheet,
                    index,
                    before: old,
                    after: new,
                    explicit,
                };
                if rows {
                    result.rows.push(change);
                } else {
                    result.columns.push(change);
                }
            }
        }
        result
    }

    pub(super) fn validate(&self, book: &Workbook, undo: bool) -> Result<(), &'static str> {
        for (changes, rows) in [(&self.rows, true), (&self.columns, false)] {
            for change in changes {
                if change.explicit {
                    book.ensure_sheet_unprotected(change.sheet)?;
                }
                let sheet = book
                    .sheet(change.sheet)
                    .ok_or("History worksheet no longer exists.")?;
                let current = if rows {
                    sheet.row_height(change.index)
                } else {
                    sheet.col_width(change.index)
                };
                if current != if undo { change.after } else { change.before } {
                    return Err("The worksheet dimensions changed outside history.");
                }
            }
        }
        Ok(())
    }

    pub(super) fn restore_parts(
        &self,
        book: &Workbook,
        snapshots: &Parts,
        undo: bool,
    ) -> Vec<(usize, HistorySnapshot)> {
        snapshots
            .iter()
            .map(|(index, snapshot)| {
                let sheet = book
                    .sheet(*index)
                    .expect("history validated its worksheets");
                let mut snapshot = snapshot.clone();
                let mut heights: BTreeMap<_, _> = sheet
                    .row_heights_in_range(snapshot.range.start.row, snapshot.range.end.row)
                    .into_iter()
                    .collect();
                let mut widths: BTreeMap<_, _> = sheet
                    .col_widths_in_range(snapshot.range.start.col, snapshot.range.end.col)
                    .into_iter()
                    .collect();
                for (changes, sizes, start, end) in [
                    (
                        &self.rows,
                        &mut heights,
                        snapshot.range.start.row,
                        snapshot.range.end.row,
                    ),
                    (
                        &self.columns,
                        &mut widths,
                        snapshot.range.start.col,
                        snapshot.range.end.col,
                    ),
                ] {
                    for change in changes.iter().filter(|change| {
                        change.sheet == *index && (start..=end).contains(&change.index)
                    }) {
                        if let Some(size) = if undo { change.before } else { change.after } {
                            sizes.insert(change.index, size);
                        } else {
                            sizes.remove(&change.index);
                        }
                    }
                }
                let mut styles: BTreeMap<_, _> = snapshot.formats.row_styles.into_iter().collect();
                for (row, style) in &mut styles {
                    style.height = heights.get(row).copied();
                }
                for (row, height) in heights {
                    styles.entry(row).or_default().height = Some(height);
                }
                snapshot.formats.row_styles = styles
                    .into_iter()
                    .filter(|(_, style)| !style.is_empty())
                    .collect();
                snapshot.column_widths = widths.into_iter().collect();
                (*index, snapshot)
            })
            .collect()
    }

    pub(super) fn retained_bytes(&self) -> usize {
        (self.rows.len() + self.columns.len()) * std::mem::size_of::<AxisChange>()
    }
}

fn captured_size(snapshots: &Parts, sheet: usize, index: u32, rows: bool) -> Option<u32> {
    // before 已按回放顺序倒置：最后一份重叠 before-image 才是事务起点。
    let (_, snapshot) = snapshots.iter().rev().find(|(target, snapshot)| {
        *target == sheet
            && if rows {
                (snapshot.range.start.row..=snapshot.range.end.row).contains(&index)
            } else {
                (snapshot.range.start.col..=snapshot.range.end.col).contains(&index)
            }
    })?;
    if rows {
        snapshot
            .formats
            .row_styles
            .iter()
            .find(|(row, _)| *row == index)
            .and_then(|(_, style)| style.height)
    } else {
        snapshot
            .column_widths
            .iter()
            .find(|(col, _)| *col == index)
            .map(|(_, size)| *size)
    }
}
