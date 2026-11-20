//! Stored reference for reapplying worksheet criteria without recompiling on open.
use super::range_contract::{validate_data_range, FilterRangeRef, MAX_CRITERIA_CELLS};
use crate::{CellRange, FilterError, Workbook};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PersistedFilterCriteria {
    pub criteria: Option<PersistedCriteriaRange>,
    pub unique_only: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PersistedCriteriaRange {
    Range(FilterRangeRef),
    Missing,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct FilterCriteriaState {
    pub(crate) link: Option<CriteriaLink>,
    pub(crate) unique_only: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CriteriaLink {
    pub(crate) sheet_key: Option<u64>,
    pub(crate) range: Option<CellRange>,
}

impl FilterCriteriaState {
    pub(crate) fn new(
        workbook: &Workbook,
        criteria: Option<FilterRangeRef>,
        unique_only: bool,
    ) -> Result<Self, FilterError> {
        Self::from_snapshot(
            workbook,
            PersistedFilterCriteria {
                criteria: criteria.map(PersistedCriteriaRange::Range),
                unique_only,
            },
        )
    }

    pub(crate) fn from_snapshot(
        workbook: &Workbook,
        snapshot: PersistedFilterCriteria,
    ) -> Result<Self, FilterError> {
        let link = match snapshot.criteria {
            Some(PersistedCriteriaRange::Range(reference)) => {
                validate_data_range(reference.range, MAX_CRITERIA_CELLS)?;
                let key = workbook
                    .sheet_key(reference.sheet)
                    .ok_or(FilterError::InvalidSheet)?;
                Some(CriteriaLink {
                    sheet_key: Some(key),
                    range: Some(reference.range),
                })
            }
            Some(PersistedCriteriaRange::Missing) => Some(CriteriaLink {
                sheet_key: None,
                range: None,
            }),
            None => None,
        };
        Ok(Self {
            link,
            unique_only: snapshot.unique_only,
        })
    }

    pub(crate) fn resolve(
        self,
        workbook: &Workbook,
    ) -> Result<Option<FilterRangeRef>, FilterError> {
        self.link
            .map(|link| {
                let missing = FilterError::InvalidCriteria(
                    "The criteria range was removed. Choose a new criteria range.",
                );
                let sheet = link
                    .sheet_key
                    .and_then(|key| workbook.sheet_index_by_key(key))
                    .ok_or(missing)?;
                let range = link.range.ok_or(missing)?;
                Ok(FilterRangeRef { sheet, range })
            })
            .transpose()
    }

    pub(crate) fn snapshot(self, workbook: &Workbook) -> PersistedFilterCriteria {
        let criteria = match self.resolve(workbook) {
            Ok(reference) => reference.map(PersistedCriteriaRange::Range),
            Err(_) => Some(PersistedCriteriaRange::Missing),
        };
        PersistedFilterCriteria {
            criteria,
            unique_only: self.unique_only,
        }
    }
}
