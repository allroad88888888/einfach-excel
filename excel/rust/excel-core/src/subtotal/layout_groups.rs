//! Partition contiguous detail records into hierarchical group runs.
use super::layout_contract::{SubtotalCalculation, SubtotalLabel, SubtotalLayer};
use crate::value_to_display;
use einfach_core::Value;
use std::ops::Range;

pub(super) struct SubtotalGroup<'a> {
    pub(super) details: Range<usize>,
    pub(super) label: SubtotalLabel,
    pub(super) calculations: Vec<&'a SubtotalCalculation>,
    pub(super) children: Vec<SubtotalGroup<'a>>,
}

pub(super) fn group_records<'a>(
    records: &[Vec<Value>],
    first_column: u32,
    layers: &'a [SubtotalLayer],
) -> SubtotalGroup<'a> {
    let mut calculations = Vec::new();
    for calculation in layers.iter().flat_map(|layer| &layer.calculations) {
        if !calculations.contains(&calculation) {
            calculations.push(calculation);
        }
    }
    let details = 0..records.len();
    let children = partition(records, first_column, layers, details.clone());
    SubtotalGroup {
        details,
        calculations,
        children,
        label: SubtotalLabel::GrandTotal {
            column: layers[0].group_by_column,
        },
    }
}

fn partition<'a>(
    records: &[Vec<Value>],
    first_column: u32,
    layers: &'a [SubtotalLayer],
    range: Range<usize>,
) -> Vec<SubtotalGroup<'a>> {
    let Some((layer, inner)) = layers.split_first() else {
        return Vec::new();
    };
    let column = (layer.group_by_column - first_column) as usize;
    let mut groups = Vec::new();
    let mut start = range.start;
    while start < range.end {
        let key = &records[start][column];
        let end = (start + 1..range.end)
            .find(|&index| !same_group(key, &records[index][column]))
            .unwrap_or(range.end);
        let children = partition(records, first_column, inner, start..end);
        groups.push(SubtotalGroup {
            details: start..end,
            label: SubtotalLabel::Group {
                column: layer.group_by_column,
                value: value_to_display(key),
            },
            calculations: layer.calculations.iter().collect(),
            children,
        });
        start = end;
    }
    groups
}

fn same_group(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Text(left), Value::Text(right)) => {
            left == right || left.to_lowercase() == right.to_lowercase()
        }
        _ => left == right,
    }
}
