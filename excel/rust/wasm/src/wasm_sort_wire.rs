use einfach_excel_core::sort::{SortColorKey, SortColorPosition, SortColorSource, SortCriterion, SortIconKey};
use einfach_excel_core::sort::{ColumnSortReport, RowSortCriterion};
use einfach_excel_core::IconSet;

include!("sort/orientation_wire.rs");

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
#[serde(deny_unknown_fields)]
struct SortKeyWireJSON {
    col: Option<u32>,
    row: Option<u32>,
    #[serde(default)]
    direction: Option<String>,
    #[serde(rename = "caseSensitive", default)]
    case_sensitive: bool,
    /// 空格位置是原生排序选项，省略时保留历史默认：空格最后。
    #[serde(rename = "emptyFirst", default)]
    empty_first: bool,
    /// Selected list snapshot; values retain whitespace and use the fill-list locale contract.
    #[serde(default)]
    list: Option<SortListWireJSON>,
}

#[derive(Clone, Debug, Deserialize)]
struct SortListWireJSON {
    values: Vec<String>,
    locale: String,
}

impl SortKeyWireJSON {
    fn into_key(self) -> Result<SortKey, String> {
        self.into_key_for(SortOrientationWireJSON::TopToBottom)
    }

    fn into_key_for(self, orientation: SortOrientationWireJSON) -> Result<SortKey, String> {
        let coordinate = orientation.coordinate(self.col, self.row)?;
        let direction = match self.direction.as_deref() {
            Some("desc") | Some("descending") => SortDirection::Descending,
            None | Some("asc") | Some("ascending") => SortDirection::Ascending,
            _ if orientation == SortOrientationWireJSON::TopToBottom => SortDirection::Ascending,
            _ => return Err("Choose a valid row sort direction.".into()),
        };
        let custom_list = match self.list.as_ref() {
            None => None,
            Some(list) => Some(std::sync::Arc::new(
                einfach_excel_core::sort_custom_list::CustomList::new(&list.values, &list.locale)
                    .map_err(|err| format!("invalid custom sort list: {err:?}"))?,
            )),
        };
        Ok(SortKey {
            col: coordinate,
            direction,
            case_sensitive: self.case_sensitive,
            empty_first: self.empty_first,
            custom_list,
        })
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
enum SortCriterionWireJSON {
    Icon(SortIconWireJSON),
    Color(SortColorWireJSON),
    Value(SortKeyWireJSON),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SortColorWireJSON {
    col: Option<u32>,
    row: Option<u32>,
    sort_on: SortColorSourceWireJSON,
    #[serde(deserialize_with = "Deserialize::deserialize")]
    color: Option<String>,
    position: SortColorPositionWireJSON,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum SortColorSourceWireJSON {
    CellColor,
    FontColor,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SortIconWireJSON {
    col: Option<u32>,
    row: Option<u32>,
    #[serde(rename = "sortOn")]
    _sort_on: SortIconSourceWireJSON,
    #[serde(deserialize_with = "Deserialize::deserialize")]
    icon: Option<SortIconTargetWireJSON>,
    position: SortColorPositionWireJSON,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SortIconSourceWireJSON {
    Icon,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SortIconTargetWireJSON {
    set: IconSet,
    index: u8,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SortColorPositionWireJSON {
    Top,
    Bottom,
    Left,
    Right,
}

impl SortColorPositionWireJSON {
    fn for_orientation(self, orientation: SortOrientationWireJSON) -> Result<SortColorPosition, String> {
        use SortOrientationWireJSON::{LeftToRight, TopToBottom};
        match (orientation, self) {
            (TopToBottom, Self::Top) | (LeftToRight, Self::Left) => Ok(SortColorPosition::Top),
            (TopToBottom, Self::Bottom) | (LeftToRight, Self::Right) => Ok(SortColorPosition::Bottom),
            _ => Err("Choose a position in the sort direction.".into()),
        }
    }
}

impl From<SortColorSourceWireJSON> for SortColorSource {
    fn from(source: SortColorSourceWireJSON) -> Self {
        match source {
            SortColorSourceWireJSON::CellColor => Self::Fill,
            SortColorSourceWireJSON::FontColor => Self::Font,
        }
    }
}

impl SortCriterionWireJSON {
    fn into_criterion(self) -> Result<SortCriterion, String> {
        let axis = SortOrientationWireJSON::TopToBottom;
        match self {
            Self::Value(key) => key.into_key().map(SortCriterion::Value),
            Self::Icon(key) => SortIconKey::new(
                axis.coordinate(key.col, key.row)?, key.icon.map(|icon| (icon.set, icon.index)),
                key.position.for_orientation(axis)?,
            ).map(SortCriterion::Icon).map_err(str::to_owned),
            Self::Color(key) => SortColorKey::new(
                axis.coordinate(key.col, key.row)?, key.sort_on.into(), key.color.as_deref(),
                key.position.for_orientation(axis)?,
            ).map(SortCriterion::Color).map_err(str::to_owned),
        }
    }

    fn into_row_criterion(self) -> Result<RowSortCriterion, String> {
        let axis = SortOrientationWireJSON::LeftToRight;
        match self {
            Self::Value(key) => {
                let key = key.into_key_for(axis)?;
                Ok(RowSortCriterion::value(key.col, key.direction, key.case_sensitive,
                    key.empty_first, key.custom_list))
            }
            Self::Icon(key) => RowSortCriterion::icon(
                axis.coordinate(key.col, key.row)?, key.icon.map(|icon| (icon.set, icon.index)),
                key.position.for_orientation(axis)?,
            ).map_err(str::to_owned),
            Self::Color(key) => RowSortCriterion::color(
                axis.coordinate(key.col, key.row)?, key.sort_on.into(), key.color.as_deref(),
                key.position.for_orientation(axis)?,
            ).map_err(str::to_owned),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
struct SortRangePayloadJSON {
    range: SortRangeWireJSON,
    #[serde(default)]
    orientation: SortOrientationWireJSON,
    #[serde(default)]
    keys: Vec<SortCriterionWireJSON>,
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
    #[serde(rename = "movedColumns", skip_serializing_if = "Option::is_none")]
    moved_columns: Option<u32>,
    #[serde(rename = "columnPermutation", skip_serializing_if = "Option::is_none")]
    column_permutation: Option<Vec<[u32; 2]>>,
}

impl SortRangeReportJSON {
    fn from_report(report: &SortRangeReport) -> Self {
        SortRangeReportJSON {
            ok: true,
            moved_rows: report.moved_rows,
            moved_columns: None,
            column_permutation: None,
            moved_cells: report.moved_cells,
            row_permutation: report
                .row_permutation
                .iter()
                .map(|&(slot, source)| [slot, source])
                .collect(),
        }
    }

    fn from_columns(report: &ColumnSortReport) -> Self {
        Self {
            ok: true,
            moved_rows: 0,
            moved_cells: report.moved_cells,
            row_permutation: Vec::new(),
            moved_columns: Some(report.moved_columns),
            column_permutation: Some(report.column_permutation.iter().map(
                |&(destination, source)| [destination, source],
            ).collect()),
        }
    }
}
