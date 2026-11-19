//! Identify only the new rows needed for a subtotal append operation.
use super::layout_contract::SubtotalCalculation;
use std::collections::BTreeMap;
use std::ops::RangeInclusive;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct SummaryIdentity {
    /// Records in the original detail sequence, independent of worksheet row positions.
    pub(super) records: RangeInclusive<u32>,
    /// None identifies a grand-total calculation.
    pub(super) group_by_column: Option<u32>,
    pub(super) calculation: SubtotalCalculation,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum LayoutRow {
    Record(u32),
    Summary(SummaryIdentity),
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct AppendedRows {
    /// Original worksheet row coordinates. Apply from bottom to top.
    pub(super) insertions: BTreeMap<u32, u32>,
    /// Final worksheet rows that need labels and SUBTOTAL formulas.
    pub(super) new_rows: Vec<u32>,
}

/// Match the old layout against the expanded plan in order. This preserves existing
/// subtotal rows and their references when adding another function or child layer.
pub(super) fn appended_rows(
    first_row: u32,
    current: &[LayoutRow],
    desired: &[LayoutRow],
) -> Result<AppendedRows, &'static str> {
    let changed =
        "The detail grouping changed. Replace the current subtotals to rebuild the groups.";
    let mut result = AppendedRows {
        insertions: BTreeMap::new(),
        new_rows: Vec::new(),
    };
    let mut existing = 0usize;
    for (final_index, row) in desired.iter().enumerate() {
        if current.get(existing) == Some(row) {
            existing += 1;
        } else if matches!(row, LayoutRow::Summary(_)) {
            *result
                .insertions
                .entry(first_row + existing as u32)
                .or_insert(0) += 1;
            result.new_rows.push(first_row + final_index as u32);
        } else {
            return Err(changed);
        }
    }
    if existing != current.len() {
        return Err(changed);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::super::layout_contract::SubtotalFunction;
    use super::*;

    fn sum(records: RangeInclusive<u32>, field: Option<u32>) -> LayoutRow {
        LayoutRow::Summary(SummaryIdentity {
            records,
            group_by_column: field,
            calculation: SubtotalCalculation {
                function: SubtotalFunction::Sum,
                columns: vec![2],
            },
        })
    }

    #[test]
    fn appending_inner_groups_inserts_only_rows_unmatched_in_the_existing_layout() {
        let current = [
            LayoutRow::Record(0),
            LayoutRow::Record(1),
            sum(0..=1, Some(0)),
            sum(0..=1, None),
        ];
        let desired = [
            LayoutRow::Record(0),
            sum(0..=0, Some(1)),
            LayoutRow::Record(1),
            sum(1..=1, Some(1)),
            sum(0..=1, Some(0)),
            sum(0..=1, None),
        ];
        let change = appended_rows(3, &current, &desired).unwrap();
        assert_eq!(
            change.insertions.into_iter().collect::<Vec<_>>(),
            [(4, 1), (5, 1)]
        );
        assert_eq!(change.new_rows, [4, 6]);
    }
}
