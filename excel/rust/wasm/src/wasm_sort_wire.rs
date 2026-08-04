#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
enum SortRangeWireJSON {
    A1(String),
    Bounds {
        #[serde(rename = "startRow")]
        start_row: u32,
        #[serde(rename = "startCol")]
        start_col: u32,
        #[serde(rename = "endRow")]
        end_row: u32,
        #[serde(rename = "endCol")]
        end_col: u32,
    },
}

impl SortRangeWireJSON {
    fn into_range(self) -> Result<CellRange, String> {
        match self {
            SortRangeWireJSON::A1(s) => {
                let (a, b) = s.split_once(':').unwrap_or((s.as_str(), s.as_str()));
                let start = CellAddress::parse(a.trim())
                    .ok_or_else(|| format!("invalid range cell: {a}"))?;
                let end = CellAddress::parse(b.trim())
                    .ok_or_else(|| format!("invalid range cell: {b}"))?;
                Ok(CellRange::new(start, end))
            }
            SortRangeWireJSON::Bounds {
                start_row,
                start_col,
                end_row,
                end_col,
            } => Ok(CellRange::new(
                CellAddress::new(start_row, start_col),
                CellAddress::new(end_row, end_col),
            )),
        }
    }
}

/// One sort key. `direction` accepts `"asc"`/`"desc"` (the UI-core
/// `SortDirection` vocabulary) plus the long `"ascending"`/`"descending"`
/// spellings; anything else — including a missing field — defaults to
/// ascending. `caseSensitive` defaults to `false` (Excel default).
#[derive(Clone, Debug, Deserialize)]
struct SortKeyWireJSON {
    col: u32,
    #[serde(default)]
    direction: Option<String>,
    #[serde(rename = "caseSensitive", default)]
    case_sensitive: bool,
}

impl SortKeyWireJSON {
    fn into_key(self) -> SortKey {
        let direction = match self.direction.as_deref() {
            Some("desc") | Some("descending") => SortDirection::Descending,
            _ => SortDirection::Ascending,
        };
        SortKey {
            col: self.col,
            direction,
            case_sensitive: self.case_sensitive,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
struct SortRangePayloadJSON {
    range: SortRangeWireJSON,
    #[serde(default)]
    keys: Vec<SortKeyWireJSON>,
    #[serde(rename = "excludedRows", default)]
    excluded_rows: Vec<u32>,
}

/// Success witness. `rowPermutation` is the changed-slot permutation as
/// `[[slotRow, sourceRow], …]` pairs (compact for the up-to-50k moved-row
/// witness; reserved for overlay remap / parity, v1 consumers may ignore).
#[derive(Clone, Debug, Serialize)]
struct SortRangeReportJSON {
    ok: bool,
    #[serde(rename = "movedRows")]
    moved_rows: u32,
    #[serde(rename = "movedCells")]
    moved_cells: u32,
    #[serde(rename = "rowPermutation")]
    row_permutation: Vec<[u32; 2]>,
}

impl SortRangeReportJSON {
    fn from_report(report: &SortRangeReport) -> Self {
        SortRangeReportJSON {
            ok: true,
            moved_rows: report.moved_rows,
            moved_cells: report.moved_cells,
            row_permutation: report
                .row_permutation
                .iter()
                .map(|&(slot, source)| [slot, source])
                .collect(),
        }
    }
}

// === Excel Table registry wire (#32) — CRUD DTO for `listTables` /
// `getTable`. Mirrors `TableEntry`'s public accessors; the range is emitted
// as an A1 string (`"A1:C10"`) to match how ranges read elsewhere on the JS
// side, plus the resolved 0-based `sheetIndex` for adapter convenience.
//
// Also the wire element of the `snapshotTables` / `restoreTables` undo
// primitive, hence `Deserialize`: a host round-trips exactly what
// `listTables` hands it. On the way back IN, `sheetIndex` is ignored — the
// engine anchors Tables by sheet NAME (so the snapshot survives `moveSheet`
// and index churn between capture and restore), which is why the field
