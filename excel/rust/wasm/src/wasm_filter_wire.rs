#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum ColumnFilterRuleJSON {
    Equals {
        #[serde(rename = "colIndex")]
        col_index: u32,
        value: String,
        #[serde(rename = "caseSensitive", default, skip_serializing_if = "is_false")]
        case_sensitive: bool,
    },
    Contains {
        #[serde(rename = "colIndex")]
        col_index: u32,
        value: String,
        #[serde(rename = "caseSensitive", default, skip_serializing_if = "is_false")]
        case_sensitive: bool,
    },
    Range {
        #[serde(rename = "colIndex")]
        col_index: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
    List {
        #[serde(rename = "colIndex")]
        col_index: u32,
        values: Vec<String>,
    },
}

fn is_false(value: &bool) -> bool {
    !*value
}

impl ColumnFilterRuleJSON {
    fn from_rule(rule: &ColumnFilterRule) -> Self {
        match rule {
            ColumnFilterRule::Equals {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRuleJSON::Equals {
                col_index: *col_index,
                value: value.clone(),
                case_sensitive: *case_sensitive,
            },
            ColumnFilterRule::Contains {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRuleJSON::Contains {
                col_index: *col_index,
                value: value.clone(),
                case_sensitive: *case_sensitive,
            },
            ColumnFilterRule::Range {
                col_index,
                min,
                max,
            } => ColumnFilterRuleJSON::Range {
                col_index: *col_index,
                min: *min,
                max: *max,
            },
            ColumnFilterRule::List { col_index, values } => ColumnFilterRuleJSON::List {
                col_index: *col_index,
                values: values.clone(),
            },
        }
    }

    fn into_rule(self) -> ColumnFilterRule {
        match self {
            ColumnFilterRuleJSON::Equals {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRule::Equals {
                col_index,
                value,
                case_sensitive,
            },
            ColumnFilterRuleJSON::Contains {
                col_index,
                value,
                case_sensitive,
            } => ColumnFilterRule::Contains {
                col_index,
                value,
                case_sensitive,
            },
            ColumnFilterRuleJSON::Range {
                col_index,
                min,
                max,
            } => ColumnFilterRule::Range {
                col_index,
                min,
                max,
            },
            ColumnFilterRuleJSON::List { col_index, values } => {
                ColumnFilterRule::List { col_index, values }
            }
        }
    }
}

/// `applyFilter` / `reapplyFilter` payload.
#[derive(Clone, Debug, Default, Deserialize)]
struct ApplyFilterPayloadJSON {
    #[serde(default)]
    rules: Vec<ColumnFilterRuleJSON>,
}

/// Success shape of the three filter commands, mirroring
/// `SortRangeReportJSON`'s `{ ok: true, … }` convention so a host can
/// discriminate on `ok` alone.
#[derive(Clone, Debug, Serialize)]
struct FilterApplyReportJSON {
    ok: bool,
    /// 0-based SOURCE rows the applied rules hid, for the WHOLE scanned
    /// extent — never a window-bounded subset. This is what the host stores
    /// verbatim as the answer to "is this row painted?".
    #[serde(rename = "hiddenRows")]
    hidden_rows: Vec<u32>,
    #[serde(rename = "scannedRows")]
    scanned_rows: u32,
    #[serde(rename = "predicateCells")]
    predicate_cells: u32,
}

/// One sheet's filter state. Element of both the `snapshotFilters` /
/// `restoreFilters` undo envelope and the persistence-v1 `filters` field,
/// so the two agree by construction. Sheet-INDEX keyed for the same reason
/// `SheetHiddenRowsJSON` is.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetFilterStateJSON {
    sheet: u32,
    rules: Vec<ColumnFilterRuleJSON>,
    /// The rows those rules hid. Carried alongside the rules, not re-derived
    /// on restore: re-deriving would evaluate against whatever the cells say
    /// at restore time, which is live evaluation wearing an undo costume.
    #[serde(rename = "hiddenRows")]
    hidden_rows: Vec<u32>,
}

impl SheetFilterStateJSON {
    fn from_entry(entry: &SheetFilterState) -> Self {
        SheetFilterStateJSON {
            sheet: entry.sheet_index as u32,
            rules: entry
                .rules
                .iter()
                .map(ColumnFilterRuleJSON::from_rule)
                .collect(),
            hidden_rows: entry.hidden_rows.clone(),
        }
    }

    fn into_entry(self) -> SheetFilterState {
        SheetFilterState {
            sheet_index: self.sheet as usize,
            rules: self
                .rules
                .into_iter()
                .map(ColumnFilterRuleJSON::into_rule)
                .collect(),
            hidden_rows: self.hidden_rows,
        }
    }
}

/// Envelope for `snapshotFilters` / `restoreFilters`, versioned exactly
/// like `HiddenRowsSnapshotJSON`.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct FilterSnapshotJSON {
    version: u32,
    filters: Vec<SheetFilterStateJSON>,
}

/// Map a [`FilterError`] to the structured `{ ok: false, code, message }`
/// rejection object the `sortRange` wire established. Codes are kebab-case,
/// matching the `sheet_error_to_js` family; `source-too-large` is the sunk
/// twin of the adapter's `FILTER_SORT_SOURCE_TOO_LARGE`.
fn filter_error_to_js(err: FilterError) -> JsValue {
    match err {
        FilterError::InvalidSheet => sort_error_to_js("invalid-sheet", None, None),
        FilterError::MutationDuringCustomCall => {
            sort_error_to_js("mutation-during-custom-call", None, None)
        }
        FilterError::SourceTooLarge {
            rows,
            columns,
            predicate_cells,
        } => sort_error_to_js(
            "source-too-large",
            None,
            Some(&format!(
                "filter predicate scan needs {predicate_cells} cells ({rows} rows x {columns} \
                 columns) but the engine cap is {MAX_FILTER_PREDICATE_CELLS}; the filter was \
                 not applied"
            )),
        ),
    }
}

/// Map a `TableError` to a stable JS error string (mirrors
/// `workbook_error_to_js`). Not part of the frozen export surface — no
/// snapshot regeneration is triggered by adding a variant here.
fn table_error_to_js(err: TableError) -> JsValue {
    JsValue::from_str(table_error_id(err))
}

/// The stable string id behind `table_error_to_js`, split out so the
/// natively-testable helpers (`restore_tables_json`) can surface the same
/// vocabulary without constructing a `JsValue`.
fn table_error_id(err: TableError) -> &'static str {
    match err {
        TableError::TooManyTables => "too-many-tables",
        TableError::InvalidName => "invalid-name",
        TableError::ReservedName => "reserved-name",
        TableError::NameLikeCellRef => "name-like-cell-ref",
        TableError::NameConflict => "name-conflict",
        TableError::RangeOverlap => "range-overlap",
        TableError::SheetNotFound => "sheet-not-found",
        TableError::NotFound => "not-found",
        TableError::ColumnNotFound => "column-not-found",
        TableError::DuplicateColumn => "duplicate-column",
        TableError::InvalidColumnName => "invalid-column-name",
        TableError::TotalsRowBlocked => "totals-row-blocked",
        TableError::NoTotalsRow => "no-totals-row",
        TableError::MutationDuringCustomCall => "mutation-during-custom-call",
        TableError::MalformedSnapshot => "malformed-snapshot",
    }
}

// Initialize the panic hook once per module load. Called automatically from
