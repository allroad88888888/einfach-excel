//! Resolve summary-row positions and outline spans from subtotal group runs.
use super::layout_contract::{
    SubtotalCalculation, SubtotalLabel, SubtotalLayer, SubtotalLayout, SubtotalPlacement,
    SubtotalRow,
};
use super::layout_groups::{group_records, SubtotalGroup};
use crate::outline::{MAX_OUTLINE_DEPTH, MAX_OUTLINE_GROUPS};
use crate::{CellAddress, CellRange};
use einfach_core::Value;
use std::collections::{BTreeMap, HashSet};

#[cfg(test)]
pub(crate) fn plan_subtotal_layout(
    source: CellRange,
    records: &[Vec<Value>],
    layers: &[SubtotalLayer],
    placement: SubtotalPlacement,
    row_limit: u32,
    column_limit: u32,
) -> Result<SubtotalLayout, &'static str> {
    plan_subtotal_layout_with_grand_order(
        source,
        records,
        layers,
        &[],
        placement,
        row_limit,
        column_limit,
    )
}

pub(crate) fn plan_subtotal_layout_with_grand_order(
    source: CellRange,
    records: &[Vec<Value>],
    layers: &[SubtotalLayer],
    grand_total_order: &[SubtotalCalculation],
    placement: SubtotalPlacement,
    row_limit: u32,
    column_limit: u32,
) -> Result<SubtotalLayout, &'static str> {
    let label_columns = source.start.col..=source.end.col;
    validate_layout(source, records, layers, row_limit, column_limit)?;
    let grand = group_records(records, source.start.col, layers, grand_total_order);
    let mut boundaries = BTreeMap::<usize, Vec<&SubtotalGroup<'_>>>::new();
    collect_summaries(&grand, placement, &mut boundaries);
    if boundaries.values().map(Vec::len).sum::<usize>() > MAX_OUTLINE_GROUPS {
        return Err("The source produces too many outline groups.");
    }

    let mut counts = Vec::new();
    let mut added = 0u32;
    let first_detail = source.start.row + 1;
    let mut after_insertions = vec![0; records.len()];
    let mut previous = 0;
    for (&boundary, groups) in &boundaries {
        after_insertions[previous..boundary].fill(added);
        let group_rows = groups
            .iter()
            .map(|group| group.calculations.len())
            .sum::<usize>() as u32;
        added = added.saturating_add(group_rows);
        counts.push((first_detail + boundary as u32, group_rows));
        previous = boundary;
    }
    after_insertions[previous..].fill(added);
    let last_row = source
        .end
        .row
        .checked_add(added)
        .filter(|&row| row < row_limit)
        .ok_or("Subtotal rows would exceed the worksheet boundary.")?;
    let detail_row = |index: usize| first_detail + index as u32 + after_insertions[index];
    let mut last_column = source.end.col;
    let mut summaries = Vec::with_capacity(added as usize);
    let mut outline = Vec::new();
    for ((_, groups), (boundary, _)) in boundaries.into_iter().zip(&counts) {
        let mut row = boundary + summaries.len() as u32;
        for group in groups {
            let group_start = row;
            let first = detail_row(group.details.start);
            let last = detail_row(group.details.end - 1);
            for calculation in &group.calculations {
                let label = summary_label(
                    &group.label,
                    label_columns.clone(),
                    &calculation.columns,
                    column_limit,
                )?;
                let column = match label {
                    SubtotalLabel::Group { column, .. } | SubtotalLabel::GrandTotal { column } => {
                        column
                    }
                };
                last_column = last_column.max(column);
                let group_by_column = match group.label {
                    SubtotalLabel::Group { column, .. } => Some(column),
                    SubtotalLabel::GrandTotal { .. } => None,
                };
                summaries.push(SubtotalRow {
                    row,
                    group_by_column,
                    details: first..=last,
                    label,
                    calculation: (*calculation).clone(),
                });
                row += 1;
            }
            outline.push(match placement {
                SubtotalPlacement::Below => first..=group_start - 1,
                SubtotalPlacement::Above => row..=last,
            });
        }
    }
    outline.sort_by_key(|rows| (*rows.start(), std::cmp::Reverse(*rows.end())));
    Ok(SubtotalLayout {
        target: CellRange::new(source.start, CellAddress::new(last_row, last_column)),
        insertions: counts,
        summaries,
        outline,
    })
}

fn collect_summaries<'a>(
    group: &'a SubtotalGroup<'a>,
    placement: SubtotalPlacement,
    boundaries: &mut BTreeMap<usize, Vec<&'a SubtotalGroup<'a>>>,
) {
    if placement == SubtotalPlacement::Above {
        boundaries
            .entry(group.details.start)
            .or_default()
            .push(group);
    }
    for child in &group.children {
        collect_summaries(child, placement, boundaries);
    }
    if placement == SubtotalPlacement::Below {
        boundaries.entry(group.details.end).or_default().push(group);
    }
}

fn summary_label(
    label: &SubtotalLabel,
    candidates: std::ops::RangeInclusive<u32>,
    calculated: &[u32],
    column_limit: u32,
) -> Result<SubtotalLabel, &'static str> {
    let preferred = match label {
        SubtotalLabel::Group { column, .. } | SubtotalLabel::GrandTotal { column } => *column,
    };
    let column = if !calculated.contains(&preferred) {
        preferred
    } else {
        let next = *candidates.end() + 1;
        candidates
            .into_iter()
            .find(|candidate| !calculated.contains(candidate))
            .or_else(|| (next < column_limit).then_some(next))
            .ok_or("Leave a column for the subtotal row labels.")?
    };
    Ok(match label {
        SubtotalLabel::Group { value, .. } => SubtotalLabel::Group {
            column,
            value: value.clone(),
        },
        SubtotalLabel::GrandTotal { .. } => SubtotalLabel::GrandTotal { column },
    })
}

fn validate_layout(
    range: CellRange,
    records: &[Vec<Value>],
    layers: &[SubtotalLayer],
    row_limit: u32,
    column_limit: u32,
) -> Result<(), &'static str> {
    if range.start.row >= range.end.row
        || range.start.col > range.end.col
        || range.end.row >= row_limit
        || range.end.col >= column_limit
        || records.len() != (range.rows() - 1) as usize
        || records
            .iter()
            .any(|record| record.len() != range.cols() as usize)
    {
        return Err("Choose a list with headings and detail rows within the worksheet.");
    }
    if layers.is_empty() || layers.len() >= MAX_OUTLINE_DEPTH {
        return Err("Use between one and seven subtotal levels.");
    }
    let fields = range.start.col..=range.end.col;
    let mut group_columns = HashSet::new();
    for layer in layers {
        if !fields.contains(&layer.group_by_column)
            || !group_columns.insert(layer.group_by_column)
            || layer.calculations.is_empty()
        {
            return Err("Choose valid group fields and at least one calculation per level.");
        }
        for calculation in &layer.calculations {
            let mut seen = HashSet::new();
            if calculation.columns.is_empty()
                || calculation
                    .columns
                    .iter()
                    .any(|column| !fields.contains(column) || !seen.insert(column))
            {
                return Err("Choose distinct subtotal columns from the source.");
            }
        }
        let key = (layer.group_by_column - range.start.col) as usize;
        if records.iter().any(|record| {
            matches!(
                record[key],
                Value::Error(_) | Value::Lambda(_) | Value::Array(_)
            )
        }) {
            return Err("Resolve errors in the group fields before adding subtotals.");
        }
    }
    Ok(())
}
