//! Interpret a planned layout as stable detail ordinals and subtotal identities.
use super::append_layout::{LayoutRow, SummaryIdentity};
use super::layout_contract::SubtotalLayout;
use std::collections::BTreeMap;

impl SubtotalLayout {
    pub(super) fn row_identities(&self) -> Vec<LayoutRow> {
        let next = self.target.start.row + 1;
        let summaries: BTreeMap<_, _> = self.summaries.iter().map(|row| (row.row, row)).collect();
        let records: BTreeMap<_, _> = (next..=self.target.end.row)
            .filter(|row| !summaries.contains_key(row))
            .enumerate()
            .map(|(index, row)| (row, index as u32))
            .collect();
        (next..=self.target.end.row)
            .map(|row| {
                if let Some(summary) = summaries.get(&row) {
                    LayoutRow::Summary(SummaryIdentity {
                        records: records[summary.details.start()]..=records[summary.details.end()],
                        group_by_column: summary.group_by_column,
                        calculation: summary.calculation.clone(),
                    })
                } else {
                    LayoutRow::Record(records[&row])
                }
            })
            .collect()
    }
}
