// Worksheet criteria and copy output use the same bounded native range DTO.
use einfach_excel_core::advanced_filter::{
    AdvancedFilterCopy, AdvancedFilterCopyPreview, AdvancedFilterSelection,
    FilterOverwriteApproval, FilterRangeRef, PersistedCriteriaRange, PersistedFilterCriteria,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterRangeReferenceJSON {
    sheet: usize,
    range: FilterRangeJSON,
}

impl From<FilterRangeRef> for FilterRangeReferenceJSON {
    fn from(value: FilterRangeRef) -> Self {
        Self {
            sheet: value.sheet,
            range: FilterRangeJSON::from_range(value.range),
        }
    }
}

impl From<FilterRangeReferenceJSON> for FilterRangeRef {
    fn from(value: FilterRangeReferenceJSON) -> Self {
        Self {
            sheet: value.sheet,
            range: value.range.into_range(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FilterRangeCriteriaJSON {
    criteria: Option<FilterRangeReferenceJSON>,
    #[serde(default)]
    unique_only: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum StoredCriteriaRangeJSON {
    Range { reference: FilterRangeReferenceJSON },
    Missing,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredFilterCriteriaJSON {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    criteria: Option<StoredCriteriaRangeJSON>,
    unique_only: bool,
}

impl From<PersistedFilterCriteria> for StoredFilterCriteriaJSON {
    fn from(value: PersistedFilterCriteria) -> Self {
        let criteria = value.criteria.map(|reference| match reference {
            PersistedCriteriaRange::Range(reference) => StoredCriteriaRangeJSON::Range {
                reference: reference.into(),
            },
            PersistedCriteriaRange::Missing => StoredCriteriaRangeJSON::Missing,
        });
        Self {
            criteria,
            unique_only: value.unique_only,
        }
    }
}

impl From<StoredFilterCriteriaJSON> for PersistedFilterCriteria {
    fn from(value: StoredFilterCriteriaJSON) -> Self {
        let criteria = value.criteria.map(|criteria| match criteria {
            StoredCriteriaRangeJSON::Range { reference } => {
                PersistedCriteriaRange::Range(reference.into())
            }
            StoredCriteriaRangeJSON::Missing => PersistedCriteriaRange::Missing,
        });
        Self {
            criteria,
            unique_only: value.unique_only,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdvancedFilterCopyRequestJSON {
    source: FilterRangeReferenceJSON,
    criteria: Option<FilterRangeReferenceJSON>,
    #[serde(default)]
    unique_only: bool,
    sheet: usize,
    destination: CellCoordinateJSON,
    #[serde(default)]
    output_fields: Vec<String>,
    row_count: u32,
    col_count: u32,
}

impl From<AdvancedFilterCopyRequestJSON> for AdvancedFilterCopy {
    fn from(value: AdvancedFilterCopyRequestJSON) -> Self {
        Self {
            selection: AdvancedFilterSelection {
                source: value.source.into(),
                criteria: value.criteria.map(FilterRangeRef::from),
                unique_only: value.unique_only,
            },
            sheet: value.sheet,
            destination: CellAddress::new(value.destination.row, value.destination.col),
            output_fields: value.output_fields,
            row_count: value.row_count,
            col_count: value.col_count,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FilterOverwriteApprovalJSON {
    target: FilterRangeJSON,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedFilterCopyPreviewJSON {
    target: FilterRangeJSON,
    matched_rows: usize,
    overwritten_cells: usize,
    sample: Vec<Vec<String>>,
    sample_truncated: bool,
}

impl From<AdvancedFilterCopyPreview> for AdvancedFilterCopyPreviewJSON {
    fn from(value: AdvancedFilterCopyPreview) -> Self {
        Self {
            target: FilterRangeJSON::from_range(value.target),
            matched_rows: value.matched_rows,
            overwritten_cells: value.overwritten_cells,
            sample: value.sample,
            sample_truncated: value.sample_truncated,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvancedFilterCopyReportJSON {
    target: FilterRangeJSON,
    matched_rows: usize,
    changed_cells: usize,
}
